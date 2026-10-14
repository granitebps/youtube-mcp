import {
  fetchComments,
  fetchVideoInfo,
  searchVideos,
  type CommentPage,
  type SearchOptions,
  type SearchPage,
  type VideoInfo,
} from "../../utils/youtube-api.js";
import type { CommentsRequest, ProviderCapabilities, YouTubeProvider } from "../provider.js";

/** Default provider: YouTube's internal InnerTube API through youtubei.js. No API key needed. */
export class InnertubeProvider implements YouTubeProvider {
  readonly capabilities: ProviderCapabilities = {
    provider: "innertube",
    backend: "youtubei.js (InnerTube)",
    authenticated: false,
    exactSearchFilters: false,
  };

  getVideoInfo(videoId: string, signal?: AbortSignal): Promise<VideoInfo> {
    return fetchVideoInfo(videoId, signal);
  }

  getComments({ videoId, maxResults, sortBy, page }: CommentsRequest, signal?: AbortSignal): Promise<CommentPage> {
    return fetchComments(videoId, maxResults, sortBy, page, signal);
  }

  search(options: SearchOptions, signal?: AbortSignal): Promise<SearchPage> {
    return searchVideos(options, signal);
  }
}
