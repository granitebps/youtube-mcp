# YouTube MCP v1.1.0

A minor release that adds an optional official YouTube Data API v3 provider and
a `get_server_info` tool. The default behavior is unchanged from 1.0.1.

## Install

Run the exact version with Node.js 22 or newer:

```bash
npx -y @granitebps/youtube-mcp@1.1.0
```

See the
[client configuration guide](https://github.com/granitebps/youtube-mcp/blob/v1.1.0/README.md#client-configuration)
for Claude, Codex, OpenCode, Cursor, and VS Code examples.

## Changes

- New `YT_PROVIDER` setting chooses the backend for `get_video_info`,
  `get_video_comments`, and `search_youtube`:
  - `innertube` (default) keeps using youtubei.js, as in 1.0.x;
  - `api` uses the official YouTube Data API v3 and requires
    `YOUTUBE_API_KEY`. It works from cloud and VPS IP ranges that YouTube
    blocks for InnerTube.

  Transcript tools always use `youtube-transcript-plus`, whichever provider is
  selected. See the
  [providers guide](https://github.com/granitebps/youtube-mcp/blob/v1.1.0/README.md#providers)
  for setup, quota costs, and differences.
- With the `api` provider, `search_youtube` applies every `sortBy` and
  `uploadDate` option exactly, so it returns no warnings. Dates are ISO 8601
  timestamps.
- The API key is sent in a request header and never appears in URLs, errors,
  or logs. An exhausted daily quota is reported as `ACCESS_BLOCKED` with the
  new `accessKind: "quota_exceeded"`.
- New `get_server_info` tool reports the version, the active provider, and the
  backend serving each tool.

## Compatibility

No existing tool, input, result field, or error code changes. The
[v1 compatibility contract](https://github.com/granitebps/youtube-mcp/blob/v1.1.0/docs/v1-compatibility.md)
now documents the new tool, the opt-in provider and its date formats, and the
new `accessKind` value.

## Known limitations

- With the default provider, YouTube may rate-limit, CAPTCHA, or require
  sign-in for some networks, especially cloud and VPS IP ranges. Those cases
  return `ACCESS_BLOCKED`.
- Transcript tools do not use the API key, so they can still return
  `ACCESS_BLOCKED` from blocked IP ranges. The server does not use cookies,
  proxies, or accounts.
- The Data API has a default daily quota of 10,000 units plus a separate
  allowance of 100 searches. Comment page N costs N units because the API only
  pages forward.
- When a language has both manual and auto-generated captions, only the manual
  track can be fetched.
- A transcript is caption text only; the server does not analyze video frames.

This project is unofficial and is not affiliated with YouTube or Google. Report
suspected vulnerabilities through the
[private security route](https://github.com/granitebps/youtube-mcp/security/advisories/new),
not a public issue.
