import { z } from "zod";
import {
  fetchTranscript,
  type TranscriptSegment,
} from "youtube-transcript-plus";
import { parseVideoId } from "../utils/parse-video-id.js";

export const getVideoTranscriptSchema = z.object({
  video: z
    .string()
    .describe("YouTube video URL or video ID"),
  lang: z
    .string()
    .default("en")
    .describe("Language code for the transcript (e.g., 'en', 'id', 'ja')"),
});

export async function getVideoTranscript(
  args: z.infer<typeof getVideoTranscriptSchema>
) {
  let videoId: string;
  try {
    videoId = parseVideoId(args.video);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `❌ Invalid video: ${msg}` }], isError: true };
  }

  try {
    const segments: TranscriptSegment[] = await fetchTranscript(videoId, {
      lang: args.lang,
    });

    if (!segments || segments.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No transcript available for this video." }],
      };
    }

    const lines: string[] = [`📝 Transcript for video ${videoId}:\n`];
    for (const seg of segments) {
      const timestamp = formatTimestamp(seg.offset);
      lines.push(`[${timestamp}] ${seg.text}`);
    }

    lines.push("\n--- Plain text ---\n");
    lines.push(segments.map((s) => s.text).join(" "));

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (
      msg.includes("disabled") ||
      msg.includes("not available") ||
      msg.includes("Could not") ||
      msg.includes("Impossible")
    ) {
      return {
        content: [{
          type: "text" as const,
          text: `Transcript not available for this video. The video may have captions disabled or no captions in language "${args.lang}".`,
        }],
      };
    }

    return { content: [{ type: "text" as const, text: `❌ Failed to fetch transcript: ${msg}` }], isError: true };
  }
}

/** Convert offset in seconds to a human-readable timestamp */
function formatTimestamp(offsetSec: number): string {
  const totalSeconds = Math.floor(offsetSec);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
