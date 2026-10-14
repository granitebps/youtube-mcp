import { runWithDeadline } from "../../utils/abort.js";
import { config } from "../../utils/config.js";
import { YouTubeError } from "../../utils/errors.js";
import { TTLCache } from "../../utils/ttl-cache.js";
import type { CommentPage, CommentThread, SearchOptions, SearchPage, VideoInfo } from "../../utils/youtube-api.js";
import type { CommentsRequest, ProviderCapabilities, YouTubeProvider } from "../provider.js";
import {
  mapCommentThread,
  mapSearchResult,
  mapVideo,
  type ApiCommentThread,
  type ApiListResponse,
  type ApiSearchItem,
  type ApiVideo,
} from "./mapper.js";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** commentThreads pages are fetched at InnerTube's page size, so `page` means the same with both providers. */
const COMMENTS_PAGE_SIZE = 20;

const UPLOAD_WINDOW_MS: Record<Exclude<SearchOptions["uploadDate"], "any">, number> = {
  hour: 60 * 60 * 1000,
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"]);

const CACHE_TTL = {
  videoInfo: 30 * 60 * 1000,
  comments: 10 * 60 * 1000,
  search: 15 * 60 * 1000,
};

type Params = Record<string, string | undefined>;

/**
 * Official YouTube Data API v3 with an API key. Works from any IP, within the
 * project's daily quota: videos.list and commentThreads.list cost 1 unit per call,
 * search.list draws from its own daily search allowance.
 */
export class DataApiProvider implements YouTubeProvider {
  readonly capabilities: ProviderCapabilities = {
    provider: "api",
    backend: "YouTube Data API v3",
    authenticated: true,
    exactSearchFilters: true,
  };

  private readonly videoInfoCache = new TTLCache<VideoInfo>(500);
  private readonly commentsCache = new TTLCache<CommentPage>(200);
  private readonly searchCache = new TTLCache<SearchPage>(200);

  constructor(private readonly apiKey: string, private readonly now: () => number = Date.now) {}

  getVideoInfo(videoId: string, signal?: AbortSignal): Promise<VideoInfo> {
    const cached = this.videoInfoCache.get(videoId);
    if (cached) return Promise.resolve(cached);

    return runWithDeadline(signal, config.requestTimeoutMs, `get_video_info(${videoId})`, async (s) => {
      const data = await this.call<ApiListResponse<ApiVideo>>("videos", {
        part: "snippet,contentDetails,statistics",
        id: videoId,
      }, s);
      const item = data.items?.[0];
      if (!item) {
        throw new YouTubeError("VIDEO_UNAVAILABLE", `Video ${videoId} was not found; it may be private, removed, or never existed`);
      }
      if (item.id !== videoId) {
        throw new YouTubeError("PARSE_ERROR", `YouTube returned metadata for video ${item.id ?? "(no ID)"} instead of ${videoId}`);
      }
      if (!item.snippet?.title) {
        throw new YouTubeError("PARSE_ERROR", `YouTube returned no title for video ${videoId}`);
      }
      const result = mapVideo(item, videoId);
      this.videoInfoCache.set(videoId, result, CACHE_TTL.videoInfo);
      return result;
    });
  }

  getComments({ videoId, maxResults, sortBy, page }: CommentsRequest, signal?: AbortSignal): Promise<CommentPage> {
    const cacheKey = `${videoId}:${maxResults}:${sortBy}:${page}`;
    const cached = this.commentsCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    return runWithDeadline(signal, config.requestTimeoutMs, `get_video_comments(${videoId})`, async (s) => {
      const base = { videoId, maxResults: String(COMMENTS_PAGE_SIZE), order: sortBy };

      // The API pages by token, so reaching page N walks the N-1 pages before it (1 quota unit each).
      let pageToken: string | undefined;
      for (let p = 1; p < page; p++) {
        const skipped = await this.call<ApiListResponse<ApiCommentThread>>("commentThreads", { ...base, part: "id", pageToken }, s);
        pageToken = skipped.nextPageToken;
        if (!pageToken) return { threads: [], hasMore: false, page, totalFetched: 0 };
      }

      const data = await this.call<ApiListResponse<ApiCommentThread>>("commentThreads", {
        ...base,
        part: "snippet,replies",
        textFormat: "plainText",
        pageToken,
      }, s);

      const threads: CommentThread[] = [];
      for (const item of data.items ?? []) {
        if (threads.length >= maxResults) break;
        const thread = mapCommentThread(item);
        if (thread) threads.push(thread);
      }

      const result: CommentPage = {
        threads,
        hasMore: !!data.nextPageToken && threads.length === maxResults,
        page,
        totalFetched: threads.length,
      };
      this.commentsCache.set(cacheKey, result, CACHE_TTL.comments);
      return result;
    });
  }

  search(options: SearchOptions, signal?: AbortSignal): Promise<SearchPage> {
    const cacheKey = JSON.stringify(options);
    const cached = this.searchCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    return runWithDeadline(signal, config.requestTimeoutMs, "search_youtube", async (s) => {
      const found = await this.call<ApiListResponse<ApiSearchItem>>("search", {
        part: "snippet",
        type: "video",
        q: options.query,
        maxResults: String(options.maxResults),
        order: options.sortBy,
        publishedAfter: options.uploadDate === "any"
          ? undefined
          : new Date(this.now() - UPLOAD_WINDOW_MS[options.uploadDate]).toISOString(),
        videoDuration: options.videoDuration === "any" ? undefined : options.videoDuration,
      }, s);

      const items = (found.items ?? []).filter((i) => i.id?.videoId);
      const ids = items.map((i) => i.id!.videoId!);

      // search.list has no views or duration; one batched videos.list call adds them.
      const details = new Map<string, ApiVideo>();
      if (ids.length > 0) {
        const videos = await this.call<ApiListResponse<ApiVideo>>("videos", {
          part: "contentDetails,statistics",
          id: ids.join(","),
        }, s);
        for (const v of videos.items ?? []) if (v.id) details.set(v.id, v);
      }

      const page: SearchPage = {
        results: items.map((i) => mapSearchResult(i, i.id!.videoId!, details.get(i.id!.videoId!))),
        warnings: [],
      };
      this.searchCache.set(cacheKey, page, CACHE_TTL.search);
      return page;
    });
  }

  /** GET one Data API endpoint. The key travels in a header, so URLs and errors never contain it. */
  private async call<T>(endpoint: string, params: Params, signal: AbortSignal): Promise<T> {
    const url = new URL(`${API_BASE}/${endpoint}`);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }

    let response: Response;
    try {
      // Looked up per call so tests can substitute globalThis.fetch.
      response = await globalThis.fetch(url, {
        headers: { "X-Goog-Api-Key": this.apiKey, Accept: "application/json" },
        signal,
      });
    } catch (err) {
      if (signal.aborted) throw signal.reason;
      const msg = err instanceof Error ? err.message : String(err);
      throw new YouTubeError("UPSTREAM_ERROR", `Network error contacting the YouTube Data API: ${msg}`);
    }

    const body = await response.text();
    if (!response.ok) throw errorFromApiResponse(response.status, body, endpoint);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new YouTubeError("PARSE_ERROR", `YouTube Data API returned invalid JSON from ${endpoint}`, {
        httpStatus: response.status, url: describeEndpoint(endpoint),
      });
    }
  }
}

function describeEndpoint(endpoint: string): string {
  return `www.googleapis.com/youtube/v3/${endpoint}`;
}

/** Classify a Data API error from its HTTP status and the reason in Google's error body. */
export function errorFromApiResponse(status: number, body: string, endpoint: string): YouTubeError {
  let reason: string | undefined;
  let message: string | undefined;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
    reason = parsed.error?.errors?.[0]?.reason;
    message = parsed.error?.message;
  } catch {
    // Not JSON (e.g. a proxy error page); classify by status alone.
  }

  const where = describeEndpoint(endpoint);
  const detail = message ? `: ${message}` : "";
  const upstream = { httpStatus: status, url: where, ...(reason && { reason }) };

  if (reason && QUOTA_REASONS.has(reason)) {
    return new YouTubeError("ACCESS_BLOCKED", `YouTube Data API quota or rate limit exceeded (HTTP ${status} from ${where})${detail}`, {
      ...upstream, accessKind: "quota_exceeded",
    });
  }
  if (reason === "commentsDisabled") {
    return new YouTubeError("COMMENTS_UNAVAILABLE", "Comments are disabled or unavailable for this video.", upstream);
  }
  if (reason === "videoNotFound") {
    return new YouTubeError("VIDEO_UNAVAILABLE", `YouTube Data API could not find the video${detail}`, upstream);
  }
  if (status === 429) {
    return new YouTubeError("ACCESS_BLOCKED", `YouTube Data API rate-limited the request (HTTP 429 from ${where})${detail}`, {
      ...upstream, accessKind: "rate_limited",
    });
  }
  // An invalid key is a 400 whose message names the API key; a disabled API or restricted key is a 403.
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message ?? ""))) {
    return new YouTubeError("ACCESS_BLOCKED", `YouTube Data API refused the request (HTTP ${status} from ${where})${detail}`, {
      ...upstream, accessKind: "forbidden",
    });
  }
  return new YouTubeError("UPSTREAM_ERROR", `YouTube Data API request failed (HTTP ${status} from ${where})${detail}`, upstream);
}
