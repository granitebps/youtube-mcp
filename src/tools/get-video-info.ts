import { z } from "zod";
import { parseVideoId } from "../utils/parse-video-id.js";
import { fetchVideoInfo } from "../utils/youtube-api.js";

export const getVideoInfoSchema = z.object({
  video: z
    .string()
    .describe("YouTube video URL or video ID"),
});

export async function getVideoInfo(
  args: z.infer<typeof getVideoInfoSchema>
) {
  const videoId = parseVideoId(args.video);
  const info = await fetchVideoInfo(videoId);

  const text = [
    `📹 ${info.title}`,
    ``,
    `Channel: ${info.channelName}`,
    `Uploaded: ${info.uploadedAt}`,
    `Duration: ${info.duration}`,
    `Views: ${Number(info.viewCount).toLocaleString()}`,
    `Likes: ${Number(info.likeCount).toLocaleString()}`,
    `Comments: ${Number(info.commentCount).toLocaleString()}`,
    ``,
    `Tags: ${info.tags.length > 0 ? info.tags.join(", ") : "none"}`,
    `Thumbnail: ${info.thumbnailUrl}`,
    ``,
    `Description:`,
    info.description,
  ].join("\n");

  return { content: [{ type: "text" as const, text }] };
}
