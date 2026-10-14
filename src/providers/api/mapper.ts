import { decodeHtmlEntities, formatDuration, parseIsoDuration } from "../../utils/format.js";
import type { CommentReply, CommentThread, SearchResult, VideoInfo } from "../../utils/youtube-api.js";

// Shapes of the YouTube Data API v3 resources we read; every field is optional because
// the API omits parts it was not asked for and statistics the owner has hidden.

interface Thumbnail { url?: string }
type Thumbnails = Partial<Record<"default" | "medium" | "high" | "standard" | "maxres", Thumbnail>>;

export interface ApiVideo {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: Thumbnails;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

interface ApiCommentSnippet {
  authorDisplayName?: string;
  authorChannelUrl?: string;
  textDisplay?: string;
  textOriginal?: string;
  likeCount?: number;
  publishedAt?: string;
}

export interface ApiCommentThread {
  id?: string;
  snippet?: { topLevelComment?: { snippet?: ApiCommentSnippet }; totalReplyCount?: number };
  replies?: { comments?: Array<{ snippet?: ApiCommentSnippet }> };
}

export interface ApiSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Thumbnails;
  };
}

export interface ApiListResponse<T> {
  items?: T[];
  nextPageToken?: string;
}

/** Map a videos.list item (parts snippet, contentDetails, statistics). The caller checks id and title. */
export function mapVideo(item: ApiVideo, videoId: string): VideoInfo {
  const s = item.snippet ?? {};
  const t = s.thumbnails ?? {};
  const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
  return {
    videoId,
    title: s.title ?? "",
    description: s.description ?? null,
    channelName: s.channelTitle || null,
    channelId: s.channelId || null,
    uploadedAt: s.publishedAt || null,
    duration: durationSeconds === null ? null : formatDuration(durationSeconds),
    durationSeconds,
    viewCount: item.statistics?.viewCount ?? null,
    likeCount: item.statistics?.likeCount ?? null,
    commentCount: item.statistics?.commentCount ?? null,
    tags: s.tags ?? [],
    thumbnailUrl: (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default)?.url ?? null,
  };
}

function mapComment(s: ApiCommentSnippet): CommentReply {
  return {
    author: s.authorDisplayName ?? "",
    authorChannelUrl: s.authorChannelUrl ?? "",
    text: s.textDisplay ?? s.textOriginal ?? "",
    likeCount: String(s.likeCount ?? 0),
    publishedAt: s.publishedAt ?? "",
  };
}

/** Map a commentThreads.list item (parts snippet, replies); null when it has no top-level comment. */
export function mapCommentThread(item: ApiCommentThread): CommentThread | null {
  const top = item.snippet?.topLevelComment?.snippet;
  if (!top) return null;
  return {
    ...mapComment(top),
    replyCount: String(item.snippet?.totalReplyCount ?? 0),
    replies: (item.replies?.comments ?? []).flatMap((c) => (c.snippet ? [mapComment(c.snippet)] : [])),
  };
}

/**
 * Map a search.list item, completed with views and duration from videos.list.
 * search.list HTML-escapes its text fields (e.g. "&#39;"); videos.list does not.
 */
export function mapSearchResult(item: ApiSearchItem, videoId: string, details: ApiVideo | undefined): SearchResult {
  const s = item.snippet ?? {};
  const t = s.thumbnails ?? {};
  const durationSeconds = parseIsoDuration(details?.contentDetails?.duration);
  return {
    videoId,
    title: decodeHtmlEntities(s.title ?? ""),
    description: decodeHtmlEntities(s.description ?? ""),
    channelTitle: decodeHtmlEntities(s.channelTitle ?? ""),
    publishedAt: s.publishedAt ?? "",
    thumbnailUrl: (t.high ?? t.medium ?? t.default)?.url ?? "",
    viewCount: details?.statistics?.viewCount ?? "",
    duration: durationSeconds === null ? "" : formatDuration(durationSeconds),
  };
}
