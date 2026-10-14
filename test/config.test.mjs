import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../dist/utils/config.js";

test("defaults apply when env is empty", () => {
  const c = loadConfig({});
  assert.deepEqual(c, {
    provider: "innertube",
    youtubeApiKey: null,
    initTimeoutMs: 15000,
    requestTimeoutMs: 20000,
    transcriptMaxBytes: 5000000,
    transcriptMaxSegments: 50000,
    transcriptPageMaxSegments: 500,
  });
});

test("env overrides are parsed", () => {
  const c = loadConfig({
    YT_INIT_TIMEOUT_MS: "1000",
    YT_REQUEST_TIMEOUT_MS: "2000",
    YT_TRANSCRIPT_MAX_BYTES: "300",
    YT_TRANSCRIPT_MAX_SEGMENTS: "40",
    YT_TRANSCRIPT_PAGE_MAX_SEGMENTS: "5",
  });
  assert.equal(c.initTimeoutMs, 1000);
  assert.equal(c.requestTimeoutMs, 2000);
  assert.equal(c.transcriptMaxBytes, 300);
  assert.equal(c.transcriptMaxSegments, 40);
  assert.equal(c.transcriptPageMaxSegments, 5);
});

test("invalid values fail fast", () => {
  for (const bad of ["0", "-5", "1.5", "abc", "10ms", "99999999999999999999"]) {
    assert.throws(() => loadConfig({ YT_REQUEST_TIMEOUT_MS: bad }), /Invalid YT_REQUEST_TIMEOUT_MS/, bad);
  }
});

test("YT_PROVIDER selects the provider; api requires YOUTUBE_API_KEY", () => {
  assert.equal(loadConfig({ YT_PROVIDER: "innertube" }).provider, "innertube");
  assert.deepEqual(
    (({ provider, youtubeApiKey }) => ({ provider, youtubeApiKey }))(loadConfig({ YT_PROVIDER: " API ", YOUTUBE_API_KEY: " key " })),
    { provider: "api", youtubeApiKey: "key" },
  );
  assert.throws(() => loadConfig({ YT_PROVIDER: "api" }), /YOUTUBE_API_KEY is required/);
  assert.throws(() => loadConfig({ YT_PROVIDER: "api", YOUTUBE_API_KEY: "  " }), /YOUTUBE_API_KEY is required/);
  assert.throws(() => loadConfig({ YT_PROVIDER: "official" }), /Invalid YT_PROVIDER/);
});

test("YOUTUBE_API_KEY is ignored unless the api provider is selected", () => {
  assert.equal(loadConfig({ YOUTUBE_API_KEY: "key" }).youtubeApiKey, null);
});
