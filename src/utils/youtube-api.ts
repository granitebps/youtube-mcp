import Innertube from "youtubei.js";

// SearchFilters type from youtubei.js (not directly exported)
interface SearchFilters {
  upload_date?: "all" | "today" | "week" | "month" | "year";
  type?: "all" | "video" | "shorts" | "channel" | "playlist" | "movie";
  duration?: "all" | "over_twenty_mins" | "under_three_mins" | "three_to_twenty_mins";
  prioritize?: "relevance" | "popularity";
}

// --- Innertube client singleton ---
let _innertube: Innertube | null = null;

async function getClient(): Promise<Innertube> {
  if (!_innertube) {
    _innertube = await Innertube.create();
  }
  return _innertube;
}

export function closeClient(): void {
  _innertube = null;
}

// --- Simple TTL cache ---
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const videoInfoCache = new TTLCache<VideoInfo>();
// commentsCache declared after CommentPage interface below
const searchCache = new TTLCache<SearchResult[]>();
const CACHE_TTL = {
  videoInfo: 30 * 60 * 1000,   // 30 minutes
  comments:  10 * 60 * 1000,   // 10 minutes
  search:    15 * 60 * 1000,   // 15 minutes
};

// --- Request timeout helper ---
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface VideoInfo {
  videoId: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  uploadedAt: string;
  duration: string;
  viewCount: string;
  likeCount: string;
  commentCount: string;
  tags: string[];
  thumbnailUrl: string;
}

export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const cached = videoInfoCache.get(videoId);
  if (cached) return cached;

  const yt = await getClient();

  let info: Awaited<ReturnType<typeof yt.getInfo>>;
  try {
    info = await withTimeout(yt.getInfo(videoId), 10_000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timed out")) {
      throw new Error("YouTube API timed out. Please try again.");
    }
    throw new Error(`Failed to fetch video info: ${msg}`);
  }

  const basic = info.basic_info;
  if (!basic.id && !basic.title) {
    throw new Error("Video not found, may be private, deleted, or unavailable.");
  }

  const publishDate = info.primary_info?.published?.toString() || "Unknown";
  const commentCountText =
    info.comments_entry_point_header?.comment_count?.toString() || "N/A";

  const result: VideoInfo = {
    videoId: basic.id || videoId,
    title: basic.title || "",
    description: basic.short_description || "",
    channelName: basic.channel?.name || basic.author || "",
    channelId: basic.channel?.id || basic.channel_id || "",
    uploadedAt: publishDate,
    duration: formatDuration(basic.duration || 0),
    viewCount: basic.view_count?.toString() || "0",
    likeCount: basic.like_count?.toString() || "0",
    commentCount: commentCountText,
    tags: basic.tags || basic.keywords || [],
    thumbnailUrl: basic.thumbnail?.[0]?.url || "",
  };

  videoInfoCache.set(videoId, result, CACHE_TTL.videoInfo);
  return result;
}

export interface CommentThread {
  author: string;
  authorChannelUrl: string;
  text: string;
  likeCount: string;
  publishedAt: string;
  replyCount: string;
  replies: CommentReply[];
}

export interface CommentReply {
  author: string;
  authorChannelUrl: string;
  text: string;
  likeCount: string;
  publishedAt: string;
}

export interface CommentPage {
  threads: CommentThread[];
  hasMore: boolean;
  page: number;
  totalFetched: number;
}

const commentsCache = new TTLCache<CommentPage>();

export async function fetchComments(
  videoId: string,
  maxResults: number = 20,
  order: "relevance" | "time" = "relevance",
  page: number = 1
): Promise<CommentPage> {
  const cacheKey = `${videoId}:${maxResults}:${order}:${page}`;
  const cached = commentsCache.get(cacheKey);
  if (cached) return cached;

  const yt = await getClient();
  const sortBy = order === "time" ? "NEWEST_FIRST" : "TOP_COMMENTS";

  let commentsData: Awaited<ReturnType<typeof yt.getComments>>;
  try {
    commentsData = await withTimeout(yt.getComments(videoId, sortBy), 10_000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timed out")) {
      throw new Error("YouTube API timed out. Please try again.");
    }
    if (msg.toLowerCase().includes("disabled") || msg.toLowerCase().includes("comments")) {
      throw new Error("Comments are disabled for this video.");
    }
    throw new Error(`Failed to fetch comments: ${msg}`);
  }

  // Navigate to the requested page using getContinuation()
  // YouTube returns ~20 threads per page
  for (let p = 1; p < page; p++) {
    if (!commentsData.has_continuation) break;
    try {
      commentsData = await withTimeout(commentsData.getContinuation(), 10_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load page ${p + 1}: ${msg}`);
    }
  }

  const threads: CommentThread[] = [];

  for (const thread of commentsData.contents) {
    if (threads.length >= maxResults) break;

    const comment = thread.comment;
    if (!comment) continue;

    const replies: CommentReply[] = [];
    if (thread.has_replies && thread.replies) {
      for (const reply of thread.replies) {
        replies.push({
          author: reply.author?.name || "",
          authorChannelUrl: reply.author?.url || "",
          text: reply.content?.toString() || "",
          likeCount: reply.like_count || "0",
          publishedAt: reply.published_time || "",
        });
      }
    }

    threads.push({
      author: comment.author?.name || "",
      authorChannelUrl: comment.author?.url || "",
      text: comment.content?.toString() || "",
      likeCount: comment.like_count || "0",
      publishedAt: comment.published_time || "",
      replyCount: comment.reply_count || "0",
      replies,
    });
  }

  const result: CommentPage = {
    threads,
    hasMore: commentsData.has_continuation && threads.length === maxResults,
    page,
    totalFetched: threads.length,
  };

  commentsCache.set(cacheKey, result, CACHE_TTL.comments);
  return result;
}

export interface SearchResult {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: string;
  duration: string;
}

export interface SearchOptions {
  query: string;
  maxResults: number;
  sortBy: "relevance" | "date" | "viewCount" | "rating";
  uploadDate: "any" | "hour" | "today" | "week" | "month" | "year";
  videoDuration: "any" | "short" | "medium" | "long";
}

export async function searchVideos(
  options: SearchOptions
): Promise<SearchResult[]> {
  const cacheKey = JSON.stringify(options);
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const yt = await getClient();

  const filters: SearchFilters = { type: "video" };

  if (options.uploadDate !== "any") {
    const dateMap: Record<string, SearchFilters["upload_date"]> = {
      today: "today",
      week: "week",
      month: "month",
      year: "year",
    };
    if (dateMap[options.uploadDate]) {
      filters.upload_date = dateMap[options.uploadDate];
    }
  }

  if (options.videoDuration !== "any") {
    const durationMap: Record<string, SearchFilters["duration"]> = {
      short: "under_three_mins",
      medium: "three_to_twenty_mins",
      long: "over_twenty_mins",
    };
    if (durationMap[options.videoDuration]) {
      filters.duration = durationMap[options.videoDuration];
    }
  }

  if (options.sortBy === "viewCount" || options.sortBy === "rating") {
    filters.prioritize = "popularity";
  }

  let searchResults: Awaited<ReturnType<typeof yt.search>>;
  try {
    searchResults = await withTimeout(yt.search(options.query, filters), 10_000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timed out")) {
      throw new Error("YouTube search timed out. Please try again.");
    }
    throw new Error(`Search failed: ${msg}`);
  }

  const results: SearchResult[] = [];

  for (const video of searchResults.videos) {
    if (results.length >= options.maxResults) break;

    const v = video as unknown as Record<string, unknown>;
    const duration = v["duration"];
    const durationText =
      typeof duration === "object" && duration !== null
        ? String((duration as Record<string, unknown>)["text"] ?? "")
        : typeof duration === "number"
        ? formatDuration(duration)
        : "";

    results.push({
      videoId: String(v["id"] ?? ""),
      title: String((v["title"] as { toString(): string } | undefined)?.toString() ?? ""),
      description: String((v["description_snippet"] as { toString(): string } | undefined)?.toString() ?? ""),
      channelTitle: String((v["author"] as Record<string, unknown> | undefined)?.["name"] ?? ""),
      publishedAt: String((v["published"] as { toString(): string } | undefined)?.toString() ?? ""),
      thumbnailUrl: String((v["thumbnails"] as Array<Record<string, unknown>> | undefined)?.[0]?.["url"] ?? ""),
      viewCount: String((v["short_view_count"] as { toString(): string } | undefined)?.toString() ?? ""),
      duration: durationText,
    });
  }

  searchCache.set(cacheKey, results, CACHE_TTL.search);
  return results;
}

/** Convert duration in seconds to human-readable format */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const h = hours > 0 ? `${hours}h ` : "";
  const m = minutes > 0 ? `${minutes}m ` : "";
  const s = secs > 0 ? `${secs}s` : "";

  return `${h}${m}${s}`.trim() || "0s";
}
