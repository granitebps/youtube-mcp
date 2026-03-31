#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { getVideoInfo, getVideoInfoSchema } from "./tools/get-video-info.js";
import {
  getVideoComments,
  getVideoCommentsSchema,
} from "./tools/get-video-comments.js";
import {
  getVideoTranscript,
  getVideoTranscriptSchema,
} from "./tools/get-video-transcript.js";
import {
  searchYoutube,
  searchYoutubeSchema,
} from "./tools/search-youtube.js";
import { randomUUID } from "node:crypto";

function createServer(): McpServer {
  const server = new McpServer({
    name: "youtube-mcp",
    version: "1.0.0",
  });

  server.registerTool("get_video_info", {
    description:
      "Get YouTube video metadata: title, views, likes, comment count, upload date, duration, tags, and description",
    inputSchema: getVideoInfoSchema.shape,
  }, async (args) => getVideoInfo(args as any));

  server.registerTool("get_video_comments", {
    description:
      "Get YouTube video comments with replies. Returns comment text, author, likes, and date",
    inputSchema: getVideoCommentsSchema.shape,
  }, async (args) => getVideoComments(args as any));

  server.registerTool("get_video_transcript", {
    description:
      "Get YouTube video transcript/captions (manual or auto-generated) with timestamps",
    inputSchema: getVideoTranscriptSchema.shape,
  }, async (args) => getVideoTranscript(args as any));

  server.registerTool("search_youtube", {
    description:
      "Search YouTube videos by query. Supports filtering by upload date (hour/today/week/month/year) and sorting by relevance, date, view count, or rating",
    inputSchema: searchYoutubeSchema.shape,
  }, async (args) => searchYoutube(args as any));

  return server;
}

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YouTube MCP server running on stdio");
}

function startHttp() {
  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";

  const app = createMcpExpressApp({ host });

  // Per-session transport map for stateful connections
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Create new transport for initialization requests
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    const mcpServer = createServer();
    await mcpServer.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  return new Promise<void>((_resolve, reject) => {
    const httpServer = app.listen(port, host, () => {
      console.error(
        `YouTube MCP server running on http://${host}:${port}/mcp`
      );
      // Do NOT resolve — keeps the promise (and process) alive
    });

    httpServer.on("error", reject);

    const shutdown = () => {
      console.error("Shutting down...");
      httpServer.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

// Select transport mode based on --http flag or TRANSPORT env var
const useHttp =
  process.argv.includes("--http") ||
  process.env.TRANSPORT === "http";

if (useHttp) {
  startHttp().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
} else {
  startStdio().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
