// Offline: the YouTube Data API v3 provider behind get_video_info, get_video_comments and
// search_youtube, the provider factory, and get_server_info. A fake fetch stands in for the API.
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { VIDEO_ID, installFakeFetch, callTool, errOf } from "./helpers.mjs";

const { DataApiProvider } = await import("../dist/providers/api/provider.js");
const { createProvider, setProviderForTesting } = await import("../dist/providers/factory.js");
const { getVideoInfo, getVideoInfoOutputSchema } = await import("../dist/tools/get-video-info.js");
const { getVideoComments, getVideoCommentsSchema, getVideoCommentsOutputSchema } = await import("../dist/tools/get-video-comments.js");
const { searchYoutube, searchYoutubeSchema, searchYoutubeOutputSchema } = await import("../dist/tools/search-youtube.js");
const { createGetServerInfo, getServerInfoOutputSchema } = await import("../dist/tools/get-server-info.js");
const { z } = await import("zod");

const KEY = "test-api-key";
const NOW = Date.parse("2026-10-14T12:00:00.000Z");

let fake;
beforeEach(() => setProviderForTesting(new DataApiProvider(KEY, () => NOW)));
afterEach(() => {
  fake?.restore();
  setProviderForTesting(null);
});

/** JSON response that also records the API key header it was sent with. */
const apiJson = (obj, code = 200) => (_url, init) => {
  apiJson.keys.push(init.headers?.["X-Goog-Api-Key"]);
  return new Response(JSON.stringify(obj), { status: code, headers: { "content-type": "application/json" } });
};
apiJson.keys = [];

const apiError = (code, reason, message) => apiJson({ error: { code, message, errors: [{ reason, message }] } }, code);

const params = (url) => Object.fromEntries(new URL(url).searchParams);

const VIDEO = {
  id: VIDEO_ID,
  snippet: {
    title: "A film",
    description: "About it",
    channelId: "UCchan",
    channelTitle: "Chan",
    publishedAt: "2017-09-14T10:00:00Z",
    tags: ["one", "two"],
    thumbnails: { default: { url: "https://i.ytimg.com/d.jpg" }, high: { url: "https://i.ytimg.com/h.jpg" } },
  },
  contentDetails: { duration: "PT1H1M5S" },
  statistics: { viewCount: "1000", likeCount: "50", commentCount: "7" },
};

test("get_video_info maps videos.list; the key goes in a header, never the URL", async () => {
  apiJson.keys = [];
  fake = installFakeFetch([[/youtube\/v3\/videos/, apiJson({ items: [VIDEO] })]]);
  const r = await callTool(getVideoInfo, { video: VIDEO_ID });

  assert.equal(r.isError, undefined);
  assert.deepEqual(r.structuredContent, {
    videoId: VIDEO_ID,
    title: "A film",
    description: "About it",
    channelName: "Chan",
    channelId: "UCchan",
    uploadedAt: "2017-09-14T10:00:00Z",
    duration: "1h 1m 5s",
    durationSeconds: 3665,
    viewCount: "1000",
    likeCount: "50",
    commentCount: "7",
    tags: ["one", "two"],
    thumbnailUrl: "https://i.ytimg.com/h.jpg",
  });
  z.object(getVideoInfoOutputSchema).strict().parse(r.structuredContent);

  assert.equal(fake.calls.length, 1);
  assert.deepEqual(params(fake.calls[0].url), { part: "snippet,contentDetails,statistics", id: VIDEO_ID });
  assert.ok(!fake.calls[0].url.includes(KEY));
  assert.deepEqual(apiJson.keys, [KEY]);
});

test("hidden statistics and live durations become null", async () => {
  const live = { ...VIDEO, contentDetails: { duration: "P0D" }, statistics: { viewCount: "3" } };
  fake = installFakeFetch([[/youtube\/v3\/videos/, apiJson({ items: [live] })]]);
  const r = await callTool(getVideoInfo, { video: VIDEO_ID });
  assert.equal(r.structuredContent.durationSeconds, null);
  assert.equal(r.structuredContent.duration, null);
  assert.equal(r.structuredContent.likeCount, null);
  assert.equal(r.structuredContent.commentCount, null);
});

test("a video the API does not return is VIDEO_UNAVAILABLE", async () => {
  fake = installFakeFetch([[/youtube\/v3\/videos/, apiJson({ items: [] })]]);
  assert.equal(errOf(await callTool(getVideoInfo, { video: VIDEO_ID })).code, "VIDEO_UNAVAILABLE");
});

test("API errors are classified by reason without exposing the key", async () => {
  const cases = [
    [apiError(403, "quotaExceeded", "The request cannot be completed because you have exceeded your quota."), "ACCESS_BLOCKED", "quota_exceeded"],
    [apiError(400, "badRequest", "API key not valid. Please pass a valid API key."), "ACCESS_BLOCKED", "forbidden"],
    [apiError(403, "accessNotConfigured", "YouTube Data API v3 has not been used in project 1 before or it is disabled."), "ACCESS_BLOCKED", "forbidden"],
    [apiError(500, "backendError", "Backend Error"), "UPSTREAM_ERROR", undefined],
    [() => new Response("<html>bad gateway</html>", { status: 502 }), "UPSTREAM_ERROR", undefined],
  ];
  for (const [handler, code, accessKind] of cases) {
    setProviderForTesting(new DataApiProvider(KEY));
    fake = installFakeFetch([[/youtube\/v3\/videos/, handler]]);
    const err = errOf(await callTool(getVideoInfo, { video: VIDEO_ID }));
    fake.restore();
    assert.equal(err.code, code, JSON.stringify(err));
    assert.equal(err.upstream.accessKind, accessKind);
    assert.equal(err.upstream.url, "www.googleapis.com/youtube/v3/videos");
    assert.ok(!JSON.stringify(err).includes(KEY));
  }
});

const thread = (n, replies = []) => ({
  id: `t${n}`,
  snippet: {
    totalReplyCount: replies.length + 3,
    topLevelComment: {
      snippet: {
        authorDisplayName: `@user${n}`,
        authorChannelUrl: `http://www.youtube.com/@user${n}`,
        textDisplay: `comment ${n}`,
        likeCount: n,
        publishedAt: "2026-01-01T00:00:00Z",
      },
    },
  },
  ...(replies.length && { replies: { comments: replies.map((text) => ({ snippet: { authorDisplayName: "@r", textDisplay: text, likeCount: 0, publishedAt: "2026-01-02T00:00:00Z" } })) } }),
});

test("get_video_comments maps commentThreads.list and walks page tokens to reach a page", async () => {
  fake = installFakeFetch([[/youtube\/v3\/commentThreads/, (url, init) => {
    const p = params(url);
    if (p.part === "id") return apiJson({ items: [], nextPageToken: p.pageToken ? "tok3" : "tok2" })(url, init);
    return apiJson({ items: [thread(1, ["a reply"]), thread(2), thread(3)], nextPageToken: "tok4" })(url, init);
  }]]);

  const args = getVideoCommentsSchema.parse({ video: VIDEO_ID, maxResults: 2, sortBy: "time", page: 3 });
  const r = await callTool(getVideoComments, args);

  assert.deepEqual(fake.calls.map((c) => params(c.url)), [
    { videoId: VIDEO_ID, maxResults: "20", order: "time", part: "id" },
    { videoId: VIDEO_ID, maxResults: "20", order: "time", part: "id", pageToken: "tok2" },
    { videoId: VIDEO_ID, maxResults: "20", order: "time", part: "snippet,replies", textFormat: "plainText", pageToken: "tok3" },
  ]);
  z.object(getVideoCommentsOutputSchema).strict().parse(r.structuredContent);
  assert.equal(r.structuredContent.page, 3);
  assert.equal(r.structuredContent.threadCount, 2);
  assert.equal(r.structuredContent.hasMore, true);
  assert.deepEqual(r.structuredContent.threads[0], {
    author: "@user1",
    authorChannelUrl: "http://www.youtube.com/@user1",
    text: "comment 1",
    likeCount: "1",
    publishedAt: "2026-01-01T00:00:00Z",
    replyCount: "4",
    replies: [{ author: "@r", authorChannelUrl: "", text: "a reply", likeCount: "0", publishedAt: "2026-01-02T00:00:00Z" }],
  });
});

test("a page past the last one is empty, and disabled comments are COMMENTS_UNAVAILABLE", async () => {
  fake = installFakeFetch([[/youtube\/v3\/commentThreads/, apiJson({ items: [thread(1)] })]]);
  const past = await callTool(getVideoComments, getVideoCommentsSchema.parse({ video: VIDEO_ID, page: 2 }));
  assert.equal(past.structuredContent.threadCount, 0);
  assert.equal(past.structuredContent.hasMore, false);
  fake.restore();

  fake = installFakeFetch([[/youtube\/v3\/commentThreads/, apiError(403, "commentsDisabled", "The video has disabled comments.")]]);
  const disabled = await callTool(getVideoComments, getVideoCommentsSchema.parse({ video: VIDEO_ID }));
  assert.equal(errOf(disabled).code, "COMMENTS_UNAVAILABLE");
});

test("search_youtube applies every option exactly and adds views and duration from videos.list", async () => {
  fake = installFakeFetch([
    [/youtube\/v3\/search/, apiJson({ items: [
      { id: { videoId: VIDEO_ID }, snippet: { title: "Tom &amp; Jerry&#39;s", description: "It&#39;s fun", channelTitle: "Chan", publishedAt: "2026-10-14T11:30:00Z", thumbnails: { high: { url: "https://i.ytimg.com/h.jpg" } } } },
      { id: { videoId: "BBBBBBBBBBB" }, snippet: { title: "Gone", channelTitle: "Chan" } },
    ] })],
    [/youtube\/v3\/videos/, apiJson({ items: [{ id: VIDEO_ID, contentDetails: { duration: "PT3M5S" }, statistics: { viewCount: "42" } }] })],
  ]);

  const args = searchYoutubeSchema.parse({ query: "cartoon", maxResults: 5, sortBy: "date", uploadDate: "hour", videoDuration: "short" });
  const r = await callTool(searchYoutube, args);

  assert.deepEqual(params(fake.calls[0].url), {
    part: "snippet", type: "video", q: "cartoon", maxResults: "5", order: "date",
    publishedAfter: "2026-10-14T11:00:00.000Z", videoDuration: "short",
  });
  assert.deepEqual(params(fake.calls[1].url), { part: "contentDetails,statistics", id: `${VIDEO_ID},BBBBBBBBBBB` });

  z.object(searchYoutubeOutputSchema).strict().parse(r.structuredContent);
  assert.equal(r.structuredContent.warnings, undefined);
  assert.deepEqual(r.structuredContent.results, [
    {
      videoId: VIDEO_ID, title: "Tom & Jerry's", description: "It's fun", channelTitle: "Chan",
      publishedAt: "2026-10-14T11:30:00Z", thumbnailUrl: "https://i.ytimg.com/h.jpg", viewCount: "42", duration: "3m 5s",
    },
    {
      videoId: "BBBBBBBBBBB", title: "Gone", description: "", channelTitle: "Chan",
      publishedAt: "", thumbnailUrl: "", viewCount: "", duration: "",
    },
  ]);
});

test("search with no results skips the videos.list call", async () => {
  fake = installFakeFetch([[/youtube\/v3\/search/, apiJson({ items: [] })]]);
  const r = await callTool(searchYoutube, searchYoutubeSchema.parse({ query: "nothing" }));
  assert.equal(r.structuredContent.resultCount, 0);
  assert.equal(fake.calls.length, 1);
  assert.equal(params(fake.calls[0].url).publishedAfter, undefined);
  assert.equal(params(fake.calls[0].url).videoDuration, undefined);
});

test("createProvider loads the provider YT_PROVIDER selects", async () => {
  const loaded = [];
  const loaders = {
    innertube: async () => (loaded.push("innertube"), "I"),
    api: async (key) => (loaded.push(`api:${key}`), "A"),
  };
  assert.equal(await createProvider({ provider: "innertube", youtubeApiKey: null }, loaders), "I");
  assert.equal(await createProvider({ provider: "api", youtubeApiKey: "k" }, loaders), "A");
  assert.deepEqual(loaded, ["innertube", "api:k"]);

  const real = await createProvider({ provider: "api", youtubeApiKey: "k" });
  assert.equal(real.capabilities.provider, "api");
  assert.equal((await createProvider({ provider: "innertube", youtubeApiKey: null })).capabilities.provider, "innertube");
});

test("get_server_info reports the active provider and each tool's backend", async () => {
  const getServerInfo = createGetServerInfo("9.9.9");
  const output = z.object(getServerInfoOutputSchema).strict();

  const api = await callTool(getServerInfo, {});
  output.parse(api.structuredContent);
  assert.equal(api.structuredContent.version, "9.9.9");
  assert.equal(api.structuredContent.provider, "api");
  assert.equal(api.structuredContent.authenticated, true);
  assert.equal(api.structuredContent.exactSearchFilters, true);
  assert.equal(api.structuredContent.tools.get_video_info, "YouTube Data API v3");
  assert.equal(api.structuredContent.tools.get_video_transcript, "youtube-transcript-plus");
  assert.ok(!api.content[0].text.includes(KEY));

  setProviderForTesting(null); // back to the configured default: innertube
  const def = await callTool(getServerInfo, {});
  assert.equal(def.structuredContent.provider, "innertube");
  assert.equal(def.structuredContent.authenticated, false);
  assert.equal(def.structuredContent.exactSearchFilters, false);
  assert.equal(def.structuredContent.tools.search_youtube, "youtubei.js (InnerTube)");
  assert.equal(def.structuredContent.tools.get_transcript_languages, "youtube-transcript-plus");
});
