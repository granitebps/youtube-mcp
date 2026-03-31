import Innertube from "youtubei.js";

// SearchFilters type from youtubei.js (not directly exported)
interface SearchFilters {
  upload_date?: "all" | "today" | "week" | "month" | "year";
  type?: "all" | "video" | "shorts" | "channel" | "playlist" | "movie";
  duration?: "all" | "over_twenty_mins" | "under_three_mins" | "three_to_twenty_mins";
  prioritize?: "relevance" | "popularity";
}

let _innertube: Innertube | null = null;

async function getClient(): Promise<Innertube> {
  if (!_innertube) {
    _innertube = await Innertube.create();
  }
  return _innertube;
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
  const yt = await getClient();
  const info = await yt.getInfo(videoId);
  const basic = info.basic_info;

  // Try to get publish date from primary_info
  const publishDate =
    info.primary_info?.published?.toString() || "Unknown";

  // Try to get comment count from comments header area
  const commentCountText =
    info.comments_entry_point_header?.comment_count?.toString() || "N/A";

  return {
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

export async function fetchComments(
  videoId: string,
  maxResults: number = 20,
  order: "relevance" | "time" = "relevance"
): Promise<CommentThread[]> {
  const yt = await getClient();
  const sortBy = order === "time" ? "NEWEST_FIRST" : "TOP_COMMENTS";
  const commentsData = await yt.getComments(videoId, sortBy);

  const threads: CommentThread[] = [];

  for (const thread of commentsData.contents) {
    if (threads.length >= maxResults) break;

    const comment = thread.comment;
    if (!comment) continue;

    // Get replies if available
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

  return threads;
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
  const yt = await getClient();

  const filters: SearchFilters = {
    type: "video",
  };

  // Map upload date
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

  // Map duration
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

  // Map sort - youtubei.js uses 'relevance' | 'popularity' as Prioritize
  if (options.sortBy === "viewCount" || options.sortBy === "rating") {
    filters.prioritize = "popularity";
  }

  const searchResults = await yt.search(options.query, filters);

  const results: SearchResult[] = [];

  for (const video of searchResults.videos) {
    if (results.length >= options.maxResults) break;

    results.push({
      videoId: ("id" in video ? (video as any).id : "") || "",
      title: ("title" in video ? (video as any).title?.toString() : "") || "",
      description:
        ("description_snippet" in video
          ? (video as any).description_snippet?.toString()
          : "") || "",
      channelTitle:
        ("author" in video ? (video as any).author?.name : "") || "",
      publishedAt:
        ("published" in video ? (video as any).published?.toString() : "") ||
        "",
      thumbnailUrl:
        ("thumbnails" in video
          ? (video as any).thumbnails?.[0]?.url
          : "") || "",
      viewCount:
        ("short_view_count" in video
          ? (video as any).short_view_count?.toString()
          : "") || "",
      duration:
        ("duration" in video
          ? typeof (video as any).duration === "object"
            ? (video as any).duration?.text || ""
            : String((video as any).duration)
          : "") || "",
    });
  }

  // If sorting by date, sort the results (youtubei.js doesn't have a direct date sort)
  if (options.sortBy === "date") {
    // Results from search are already roughly sorted by relevance,
    // but we requested upload_date filter, which is the best we can do
  }

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
