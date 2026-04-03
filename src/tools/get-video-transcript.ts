import { z } from "zod";
import {
  fetchTranscript,
  type TranscriptSegment,
} from "youtube-transcript-plus";
import { parseVideoId } from "../utils/parse-video-id.js";

export const getVideoTranscriptSchema = z.object({
  video: z
    .string()
    .min(1, "Video URL or ID is required")
    .trim()
    .describe("YouTube video URL or video ID"),
  lang: z
    .string()
    .min(2, "Language code must be at least 2 characters (e.g. 'en', 'id')")
    .max(10)
    .trim()
    .default("en")
    .describe("Language code for the transcript (e.g., 'en', 'id', 'ja')"),
  maxSegments: z
    .number()
    .min(0)
    .default(0)
    .describe("Maximum number of transcript segments to return. 0 (default) returns all segments. Use with startSegment for pagination."),
  startSegment: z
    .number()
    .min(0)
    .default(0)
    .describe("Segment index to start from (0-based). Use with maxSegments to paginate through long transcripts."),
});

const transcriptSegmentSchema = z.object({
  index: z.number().int().min(0),
  offsetSeconds: z.number(),
  durationSeconds: z.number().nullable(),
  timestamp: z.string(),
  text: z.string(),
});

export const getVideoTranscriptOutputSchema = {
  videoId: z.string(),
  languageCode: z.string(),
  available: z.boolean(),
  totalSegments: z.number().int().min(0),
  startSegment: z.number().int().min(0),
  returnedSegments: z.number().int().min(0),
  hasMore: z.boolean(),
  nextStartSegment: z.number().int().min(0).nullable(),
  plainText: z.string(),
  message: z.string().optional(),
  segments: z.array(transcriptSegmentSchema),
};

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
      const structuredContent = {
        videoId,
        languageCode: args.lang,
        available: false,
        totalSegments: 0,
        startSegment: 0,
        returnedSegments: 0,
        hasMore: false,
        nextStartSegment: null,
        plainText: "",
        message: "No transcript available for this video.",
        segments: [],
      };

      return {
        content: [{ type: "text" as const, text: "No transcript available for this video." }],
        structuredContent,
      };
    }

    const totalSegments = segments.length;
    const start = Math.min(args.startSegment, totalSegments);
    const sliced = args.maxSegments > 0
      ? segments.slice(start, start + args.maxSegments)
      : segments.slice(start);

    const hasMore = start + sliced.length < totalSegments;
    const nextStart = start + sliced.length;
    const structuredSegments = sliced.map((seg, index) => ({
      index: start + index,
      offsetSeconds: seg.offset,
      durationSeconds: typeof seg.duration === "number" ? seg.duration : null,
      timestamp: formatTimestamp(seg.offset),
      text: seg.text,
    }));
    const plainText = sliced.map((s) => s.text).join(" ");

    const lines: string[] = [
      `📝 Transcript for video ${videoId} (segments ${start + 1}–${start + sliced.length} of ${totalSegments}):\n`,
    ];

    for (const seg of structuredSegments) {
      lines.push(`[${seg.timestamp}] ${seg.text}`);
    }

    if (hasMore) {
      lines.push(`\n⏭️ More transcript available. Fetch next chunk with startSegment=${nextStart}${args.maxSegments > 0 ? ` and maxSegments=${args.maxSegments}` : ""}.`);
    }

    lines.push("\n--- Plain text ---\n");
    lines.push(plainText);

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      structuredContent: {
        videoId,
        languageCode: args.lang,
        available: true,
        totalSegments,
        startSegment: start,
        returnedSegments: structuredSegments.length,
        hasMore,
        nextStartSegment: hasMore ? nextStart : null,
        plainText,
        segments: structuredSegments,
      },
    };
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
        structuredContent: {
          videoId,
          languageCode: args.lang,
          available: false,
          totalSegments: 0,
          startSegment: 0,
          returnedSegments: 0,
          hasMore: false,
          nextStartSegment: null,
          plainText: "",
          message: `Transcript not available for this video. The video may have captions disabled or no captions in language "${args.lang}".`,
          segments: [],
        },
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
