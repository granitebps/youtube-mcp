/** Text and duration formatting shared by the providers and the transcript tools. */

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Convert duration in seconds to human-readable format */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const h = hours > 0 ? `${hours}h ` : "";
  const m = minutes > 0 ? `${minutes}m ` : "";
  const s = secs > 0 ? `${secs}s` : "";

  return `${h}${m}${s}`.trim() || "0s";
}

/**
 * Parse an ISO 8601 duration as returned by the YouTube Data API (e.g. "PT1H2M3S", "P1DT2H").
 * Returns null for unparseable values and for zero ("P0D" is what live streams report).
 */
export function parseIsoDuration(value: string | undefined): number | null {
  const m = value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  const seconds = Number(d) * 86_400 + Number(h) * 3_600 + Number(min) * 60 + Number(s);
  return seconds > 0 ? seconds : null;
}
