import { z } from "zod";
import { parseVideoId } from "../utils/parse-video-id.js";
import { fetchVideoInfo } from "../utils/youtube-api.js";

export const getVideoInfoSchema = z.object({
  video: z
    .string()
    .min(1, "Video URL or ID is required")
    .trim()
    .describe("YouTube video URL or video ID"),
});

export async function getVideoInfo(
  args: z.infer<typeof getVideoInfoSchema>
) {
  let videoId: string;
  try {
    videoId = parseVideoId(args.video);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `❌ Invalid video: ${msg}` }], isError: true };
  }

  try {
    const info = await fetchVideoInfo(videoId);
    const viewCount = isNaN(Number(info.viewCount)) ? info.viewCount : Number(info.viewCount).toLocaleString();
    const likeCount = isNaN(Number(info.likeCount)) ? info.likeCount : Number(info.likeCount).toLocaleString();
    const commentCount = isNaN(Number(info.commentCount)) ? info.commentCount : Number(info.commentCount).toLocaleString();

    const text = [
      `📹 ${info.title}`,
      ``,
      `Channel: ${info.channelName}`,
      `Uploaded: ${info.uploadedAt}`,
      `Duration: ${info.duration}`,
      `Views: ${viewCount}`,
      `Likes: ${likeCount}`,
      `Comments: ${commentCount}`,
      ``,
      `Tags: ${info.tags.length > 0 ? info.tags.join(", ") : "none"}`,
      `Thumbnail: ${info.thumbnailUrl}`,
      ``,
      `Description:`,
      info.description,
    ].join("\n");

    return { content: [{ type: "text" as const, text }] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `❌ ${msg}` }], isError: true };
  }
}
