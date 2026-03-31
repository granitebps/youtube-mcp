import { z } from "zod";
import { searchVideos } from "../utils/youtube-api.js";

export const searchYoutubeSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .trim()
    .describe("Search query string"),
  maxResults: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of results to return (1-50)"),
  sortBy: z
    .enum(["relevance", "date", "viewCount", "rating"])
    .default("relevance")
    .describe(
      "Sort order: 'relevance' (default), 'date' (newest), 'viewCount' (most popular), 'rating' (highest rated)"
    ),
  uploadDate: z
    .enum(["any", "hour", "today", "week", "month", "year"])
    .default("any")
    .describe(
      "Filter by upload date: 'any', 'hour', 'today', 'week', 'month', 'year'"
    ),
  videoDuration: z
    .enum(["any", "short", "medium", "long"])
    .default("any")
    .describe(
      "Filter by duration: 'any', 'short' (<3min), 'medium' (3-20min), 'long' (>20min)"
    ),
});

export async function searchYoutube(
  args: z.infer<typeof searchYoutubeSchema>
) {
  let results: Awaited<ReturnType<typeof searchVideos>>;
  try {
    results = await searchVideos({
      query: args.query,
      maxResults: args.maxResults,
      sortBy: args.sortBy,
      uploadDate: args.uploadDate,
      videoDuration: args.videoDuration,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `❌ ${msg}` }], isError: true };
  }

  if (results.length === 0) {
    return {
      content: [
        { type: "text" as const, text: "No results found for this search." },
      ],
    };
  }

  const lines: string[] = [
    `🔍 Found ${results.length} result(s) for "${args.query}":\n`,
  ];

  for (const [i, r] of results.entries()) {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   Channel: ${r.channelTitle}`);
    if (r.publishedAt) lines.push(`   Published: ${r.publishedAt}`);
    if (r.viewCount) lines.push(`   Views: ${r.viewCount}`);
    if (r.duration) lines.push(`   Duration: ${r.duration}`);
    lines.push(`   Video ID: ${r.videoId}`);
    lines.push(`   URL: https://www.youtube.com/watch?v=${r.videoId}`);
    if (r.description) {
      const desc =
        r.description.length > 150
          ? r.description.slice(0, 150) + "..."
          : r.description;
      lines.push(`   Description: ${desc}`);
    }
    lines.push("");
  }

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
