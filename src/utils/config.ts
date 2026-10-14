/**
 * Operational limits and provider selection, read once from the environment at startup.
 * Invalid values fail fast so a misconfigured server never starts half-working.
 */
export type ProviderName = "innertube" | "api";

export interface Config {
  /** Backend for get_video_info, get_video_comments and search_youtube. Transcripts always use youtube-transcript-plus. */
  provider: ProviderName;
  /** YouTube Data API v3 key; set exactly when provider is "api". */
  youtubeApiKey: string | null;
  /** Deadline for creating the shared youtubei.js client. */
  initTimeoutMs: number;
  /** Deadline for one tool call's upstream work, including waiting for client init. */
  requestTimeoutMs: number;
  /** Maximum bytes read from each response fetched for captions (watch page, player JSON, caption track). */
  transcriptMaxBytes: number;
  /** Maximum caption segments processed from one track. */
  transcriptMaxSegments: number;
  /** Maximum caption segments returned in one get_video_transcript response. */
  transcriptPageMaxSegments: number;
}

type NumericKey = Exclude<keyof Config, "provider" | "youtubeApiKey">;

const DEFAULTS: Pick<Config, NumericKey> = {
  initTimeoutMs: 15_000,
  requestTimeoutMs: 20_000,
  transcriptMaxBytes: 5_000_000,
  transcriptMaxSegments: 50_000,
  transcriptPageMaxSegments: 500,
};

const ENV_KEYS: Record<NumericKey, string> = {
  initTimeoutMs: "YT_INIT_TIMEOUT_MS",
  requestTimeoutMs: "YT_REQUEST_TIMEOUT_MS",
  transcriptMaxBytes: "YT_TRANSCRIPT_MAX_BYTES",
  transcriptMaxSegments: "YT_TRANSCRIPT_MAX_SEGMENTS",
  transcriptPageMaxSegments: "YT_TRANSCRIPT_PAGE_MAX_SEGMENTS",
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawProvider = env.YT_PROVIDER?.trim().toLowerCase() || "innertube";
  if (rawProvider !== "innertube" && rawProvider !== "api") {
    throw new Error(`Invalid YT_PROVIDER="${env.YT_PROVIDER}": expected "innertube" or "api"`);
  }
  const youtubeApiKey = env.YOUTUBE_API_KEY?.trim() || null;
  if (rawProvider === "api" && !youtubeApiKey) {
    throw new Error('YOUTUBE_API_KEY is required when YT_PROVIDER="api"');
  }

  const config: Config = {
    provider: rawProvider,
    youtubeApiKey: rawProvider === "api" ? youtubeApiKey : null,
    ...DEFAULTS,
  };
  for (const key of Object.keys(ENV_KEYS) as NumericKey[]) {
    const name = ENV_KEYS[key];
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") continue;
    if (!/^\d+$/.test(raw.trim()) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
      throw new Error(`Invalid ${name}="${raw}": expected a positive integer`);
    }
    config[key] = Number(raw);
  }
  return config;
}

export const config: Config = loadConfig();
