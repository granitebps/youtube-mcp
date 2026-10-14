import { z } from "zod";
import { getProvider } from "../providers/factory.js";
import { errorResult } from "../utils/errors.js";

export const getServerInfoSchema = z.object({});

const TRANSCRIPT_BACKEND = "youtube-transcript-plus";

export const getServerInfoOutputSchema = {
  name: z.string(),
  version: z.string(),
  provider: z.enum(["innertube", "api"]).describe("Value of YT_PROVIDER; selects the backend for video info, comments, and search"),
  authenticated: z.boolean().describe("Whether the provider sends credentials (a YouTube Data API key)"),
  exactSearchFilters: z.boolean().describe("Whether search_youtube applies every sortBy and uploadDate option exactly, without warnings"),
  tools: z.record(z.string(), z.string()).describe("Backend serving each tool"),
};

/** get_server_info handler; version comes from package.json via the entry point. */
export function createGetServerInfo(version: string) {
  return async function getServerInfo(_args: z.infer<typeof getServerInfoSchema>) {
    try {
      const { capabilities } = await getProvider();
      const tools = {
        get_video_info: capabilities.backend,
        get_video_comments: capabilities.backend,
        search_youtube: capabilities.backend,
        get_video_transcript: TRANSCRIPT_BACKEND,
        get_transcript_languages: TRANSCRIPT_BACKEND,
        get_server_info: "local",
      };
      const structuredContent = {
        name: "youtube-mcp",
        version,
        provider: capabilities.provider,
        authenticated: capabilities.authenticated,
        exactSearchFilters: capabilities.exactSearchFilters,
        tools,
      };

      const text = [
        `youtube-mcp ${version}`,
        `Provider: ${capabilities.provider} (${capabilities.backend})${capabilities.authenticated ? ", authenticated with an API key" : ""}`,
        ``,
        `Tools:`,
        ...Object.entries(tools).map(([tool, backend]) => `  ${tool}: ${backend}`),
      ].join("\n");

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    } catch (err: unknown) {
      return errorResult(err);
    }
  };
}
