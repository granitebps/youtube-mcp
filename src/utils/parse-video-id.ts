/**
 * Extract a YouTube video ID from various URL formats or a plain ID string.
 * Supports: watch URLs, youtu.be short links, embed URLs, shorts URLs, and plain IDs.
 */
export function parseVideoId(input: string): string {
  const trimmed = input.trim();

  // Plain video ID (11 characters, alphanumeric + dash + underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    // youtube.com/watch?v=VIDEO_ID
    if (url.searchParams.has("v")) {
      return url.searchParams.get("v")!;
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);

    // youtu.be/VIDEO_ID
    if (url.hostname === "youtu.be" && pathSegments.length >= 1) {
      return pathSegments[0];
    }

    // youtube.com/embed/VIDEO_ID or youtube.com/v/VIDEO_ID
    if (
      (pathSegments[0] === "embed" || pathSegments[0] === "v") &&
      pathSegments.length >= 2
    ) {
      return pathSegments[1];
    }

    // youtube.com/shorts/VIDEO_ID
    if (pathSegments[0] === "shorts" && pathSegments.length >= 2) {
      return pathSegments[1];
    }

    // youtube.com/live/VIDEO_ID
    if (pathSegments[0] === "live" && pathSegments.length >= 2) {
      return pathSegments[1];
    }
  } catch {
    // not a valid URL — fall through
  }

  throw new Error(
    `Could not extract video ID from: "${input}". Provide a YouTube URL or an 11-character video ID.`
  );
}
