import { z } from "zod";
import { parseVideoId } from "../utils/parse-video-id.js";
import { fetchComments } from "../utils/youtube-api.js";

export const getVideoCommentsSchema = z.object({
  video: z
    .string()
    .describe("YouTube video URL or video ID"),
  maxResults: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of comment threads to return (1-100)"),
  sortBy: z
    .enum(["time", "relevance"])
    .default("relevance")
    .describe("Sort order: 'relevance' (top comments) or 'time' (newest first)"),
});

export async function getVideoComments(
  args: z.infer<typeof getVideoCommentsSchema>
) {
  let videoId: string;
  try {
    videoId = parseVideoId(args.video);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `❌ Invalid video: ${msg}` }], isError: true };
  }

  let comments: Awaited<ReturnType<typeof fetchComments>>;
  try {
    comments = await fetchComments(videoId, args.maxResults, args.sortBy);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `❌ ${msg}` }], isError: true };
  }

  if (comments.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No comments found for this video." }],
    };
  }

  const lines: string[] = [`💬 ${comments.length} comment thread(s):\n`];

  for (const [i, comment] of comments.entries()) {
    lines.push(`--- Comment ${i + 1} ---`);
    lines.push(`Author: ${comment.author}`);
    lines.push(`Date: ${comment.publishedAt}`);
    lines.push(`Likes: ${comment.likeCount}`);
    lines.push(`Text: ${comment.text}`);

    if (comment.replies.length > 0) {
      lines.push(`  Replies (${comment.replies.length} of ${comment.replyCount}):`);
      for (const reply of comment.replies) {
        lines.push(`    → ${reply.author} (${reply.publishedAt}, ${reply.likeCount} likes)`);
        lines.push(`      ${reply.text}`);
      }
    }
    lines.push("");
  }

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
