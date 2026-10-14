import type { ProviderName } from "../utils/config.js";
import type { CommentPage, SearchOptions, SearchPage, VideoInfo } from "../utils/youtube-api.js";

export interface ProviderCapabilities {
  provider: ProviderName;
  /** Library or API that serves the provider's tools. */
  backend: string;
  /** Whether requests carry credentials (an API key). */
  authenticated: boolean;
  /** Whether search applies every sortBy and uploadDate option exactly, without warnings. */
  exactSearchFilters: boolean;
}

export interface CommentsRequest {
  videoId: string;
  maxResults: number;
  sortBy: "relevance" | "time";
  page: number;
}

/** Backend for get_video_info, get_video_comments and search_youtube. Transcript tools do not use providers. */
export interface YouTubeProvider {
  readonly capabilities: ProviderCapabilities;
  getVideoInfo(videoId: string, signal?: AbortSignal): Promise<VideoInfo>;
  getComments(request: CommentsRequest, signal?: AbortSignal): Promise<CommentPage>;
  search(options: SearchOptions, signal?: AbortSignal): Promise<SearchPage>;
}
