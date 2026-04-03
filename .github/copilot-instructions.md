# Copilot Instructions

## Build, test, and lint commands

- `npm install` installs dependencies.
- `npm run build` compiles the TypeScript source in `src/` to `dist/`. This is the main verification command currently configured in the repo.
- `npm start` runs the built MCP server over stdio from `dist/index.js`.
- `npm run start:http` runs the built server in Streamable HTTP mode. `node dist/index.js --http` is equivalent.
- `npm run dev` and `npm run dev:http` do a one-time `tsc` build and then start the server; they are not watch-mode commands.
- There is currently no `test`, `lint`, `typecheck`, or single-test script in `package.json`, and there are no committed `*.test.*` or `*.spec.*` files. If you need verification, use `npm run build` unless the repo adds more commands later.

## High-level architecture

- `src/index.ts` is the only entrypoint. It builds an `McpServer`, registers all tools, and then selects the transport:
  - stdio by default via `StdioServerTransport`
  - HTTP when `--http` is passed or `TRANSPORT=http` is set
- In HTTP mode, `src/index.ts` builds an Express app through the MCP SDK, adds optional bearer-token auth with `API_TOKEN`, rate-limits `/mcp`, and keeps a `Map<string, StreamableHTTPServerTransport>` so each MCP session can continue across requests.
- Each tool lives in `src/tools/` and follows the same pattern:
  - export a Zod schema
  - export an output schema for `structuredContent`
  - export an async handler
  - register the tool in `createServer()` using `inputSchema: schema.shape` and `outputSchema`
  - wrap the handler with `withLogging(...)`
- Shared YouTube access lives in `src/utils/youtube-api.ts`. That module owns:
  - the singleton `youtubei.js` `Innertube` client
  - TTL caches for video info, comment pages, and search results
  - a 10-second timeout wrapper around upstream calls
- Transcript features are the notable exception to the `youtubei.js` path:
  - `get_video_transcript` and `get_transcript_languages` use `youtube-transcript-plus`
  - metadata, comments, and search use `youtubei.js`
- `src/utils/parse-video-id.ts` is the normalization layer for every tool that accepts a URL or ID. It supports watch URLs, `youtu.be`, embed URLs, shorts, live URLs, and raw 11-character IDs.

## Key conventions

- Tool responses are JSON-first for agents and text-second for humans. Successful handlers should return both `structuredContent` and concise `content` text; `outputSchema` in `src/index.ts` should stay aligned with the `structuredContent` shape.
- Use `content` for short summaries, not as the only source of truth. Agents should be able to consume stable fields from `structuredContent` without parsing prose, emojis, or pagination hints out of text.
- Operational failures still use readable `isError: true` text responses rather than throwing user-facing errors upward.
- Keep logs on stderr only. `src/utils/logger.ts` writes directly to `process.stderr`, which is important so stdio MCP responses stay clean on stdout.
- Reuse the existing normalization and transport patterns when adding tools:
  - parse user input with `parseVideoId(...)`
  - keep request-specific error handling in the tool module
  - keep shared YouTube client/caching logic in `src/utils/youtube-api.ts`
- Schema descriptions matter here. The Zod field descriptions in each tool schema are used as MCP-facing input documentation, so keep them specific and client-friendly when changing or adding parameters.
- The repo assumes no YouTube API key. README and `.env.example` both reflect that all data comes from `youtubei.js` or `youtube-transcript-plus`; the only environment variables currently in scope are transport/network settings plus optional `API_TOKEN` protection for HTTP mode.
