# YouTube MCP Server

An MCP (Model Context Protocol) server that provides YouTube video data to AI agents like GitHub Copilot, Claude Desktop, and Cursor.

Supports both **stdio** (local) and **Streamable HTTP** (VPS/remote) transports.

## Features

| Tool | Description |
|------|-------------|
| `search_youtube` | Search videos with filters for upload date and popularity |
| `get_video_info` | Video metadata: title, views, likes, upload date, duration, tags, description |
| `get_video_comments` | Comment threads with full replies, author info, and likes |
| `get_video_transcript` | Transcripts (manual + auto-generated captions) with timestamps |

## Prerequisites

- **Node.js 18+**

> **No YouTube API key required!** This server uses `youtubei.js` (YouTube's InnerTube API) for video info, comments, and search, and `youtube-transcript-plus` for transcripts. Both work without any API key or authentication.

## Setup

```bash
# Clone and install
cd youtube-mcp
npm install

# Build
npm run build
```

---

## Option 1: Local (stdio) — Default

This is the simplest setup. The MCP client spawns the server as a subprocess.

```bash
npm start
```

### GitHub Copilot (VS Code)

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "youtube": {
        "command": "node",
        "args": ["/absolute/path/to/youtube-mcp/dist/index.js"]
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["/absolute/path/to/youtube-mcp/dist/index.js"]
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["/absolute/path/to/youtube-mcp/dist/index.js"]
    }
  }
}
```

---

## Option 2: VPS Deployment (Streamable HTTP)

For remote deployment, the server runs as a persistent HTTP service using the **Streamable HTTP** transport (the current MCP standard, replacing the deprecated SSE transport).

### 1. Deploy to your VPS

```bash
# On your VPS
git clone <your-repo-url> youtube-mcp
cd youtube-mcp
npm install
npm run build

# Create .env (optional, for HTTP mode)
cp .env.example .env
# Uncomment TRANSPORT=http, PORT, HOST as needed
```

### 2. Run with HTTP transport

```bash
# Using --http flag
node dist/index.js --http

# Or using environment variable
TRANSPORT=http PORT=3000 node dist/index.js

# Or using npm script
npm run start:http
```

The server will listen on `http://0.0.0.0:3000/mcp`.

### 3. Set up Nginx reverse proxy with TLS

```nginx
server {
    listen 443 ssl;
    server_name mcp.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/mcp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.yourdomain.com/privkey.pem;

    location /mcp {
        proxy_pass http://127.0.0.1:3000/mcp;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SSE streaming
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

Get a free TLS certificate:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mcp.yourdomain.com
```

### 4. Keep it running with systemd

Create `/etc/systemd/system/youtube-mcp.service`:

```ini
[Unit]
Description=YouTube MCP Server
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/youtube-mcp
ExecStart=/usr/bin/node dist/index.js --http
Restart=always
RestartSec=5
Environment=TRANSPORT=http
Environment=PORT=3000
Environment=HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable youtube-mcp
sudo systemctl start youtube-mcp
sudo systemctl status youtube-mcp
```

### 5. Connect MCP clients to your VPS

#### GitHub Copilot (VS Code) — Remote

```json
{
  "mcp": {
    "servers": {
      "youtube": {
        "type": "http",
        "url": "https://mcp.yourdomain.com/mcp"
      }
    }
  }
}
```

#### Claude Desktop — Remote

```json
{
  "mcpServers": {
    "youtube": {
      "type": "streamable-http",
      "url": "https://mcp.yourdomain.com/mcp"
    }
  }
}
```

---

## Usage Examples

Once connected, you can ask your AI agent things like:

- *"Get info about this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ"*
- *"Show me the top comments on video ID abc123"*
- *"Get the transcript of this video in English"*
- *"Summarize the transcript of https://youtu.be/xyz789"*
- *"Search for Node.js tutorials uploaded this week, sorted by views"*
- *"Find the most popular React videos from the last month"*

## Tool Details

### `search_youtube`
- **Input**: `query` (search text), `maxResults` (1-50, default 10), `sortBy` (`relevance` | `date` | `viewCount` | `rating`), `uploadDate` (`any` | `hour` | `today` | `week` | `month` | `year`), `videoDuration` (`any` | `short` | `medium` | `long`)
- **Returns**: List of matching videos with title, channel, publish date, video ID, and URL

### `get_video_info`
- **Input**: `video` (YouTube URL or video ID)
- **Returns**: Title, channel, upload date, duration, views, likes, comment count, tags, thumbnail, description

### `get_video_comments`
- **Input**: `video` (URL or ID), `maxResults` (1-100, default 20), `sortBy` (`relevance` or `time`)
- **Returns**: Comment threads with author, text, likes, date, and nested replies

### `get_video_transcript`
- **Input**: `video` (URL or ID), `lang` (language code, default `en`)
- **Returns**: Timestamped transcript segments + plain text version
- **Note**: Does NOT require an API key — works via YouTube's internal caption system

## Rate Limits

This server uses YouTube's InnerTube API (the same API used by youtube.com). There are **no official API quotas**, but:
- Heavy automated usage may trigger CAPTCHAs or temporary blocks
- Use responsibly — add delays between bulk requests if needed
- All tools are free with no API key required

## License

ISC
