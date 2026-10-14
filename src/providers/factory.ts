import { config, type Config } from "../utils/config.js";
import type { YouTubeProvider } from "./provider.js";

export interface ProviderLoaders {
  innertube(): Promise<YouTubeProvider>;
  api(apiKey: string): Promise<YouTubeProvider>;
}

const defaultLoaders: ProviderLoaders = {
  async innertube() {
    const { InnertubeProvider } = await import("./innertube/provider.js");
    return new InnertubeProvider();
  },
  async api(apiKey) {
    const { DataApiProvider } = await import("./api/provider.js");
    return new DataApiProvider(apiKey);
  },
};

export async function createProvider(
  cfg: Pick<Config, "provider" | "youtubeApiKey">,
  loaders: ProviderLoaders = defaultLoaders,
): Promise<YouTubeProvider> {
  if (cfg.provider === "api") return loaders.api(cfg.youtubeApiKey!);
  return loaders.innertube();
}

let _provider: Promise<YouTubeProvider> | null = null;

/** The provider selected by YT_PROVIDER, created on first use and shared by every tool call. */
export function getProvider(): Promise<YouTubeProvider> {
  return (_provider ??= createProvider(config));
}

/** Test hook: use the given provider, or null to go back to the configured one. */
export function setProviderForTesting(provider: YouTubeProvider | null): void {
  _provider = provider ? Promise.resolve(provider) : null;
}
