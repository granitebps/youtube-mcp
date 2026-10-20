# Security policy

## Supported versions

Security fixes target the latest published release.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. Include the affected version, impact, reproduction steps, and any proposed mitigation.

Never include a `YOUTUBE_API_KEY`, `API_TOKEN` value, cookie, or authorization header in a report. Replace any token that may have been exposed.

## Credential model

The default `innertube` provider uses unofficial access without a YouTube Data API key or account. The optional `api` provider requires the user's own `YOUTUBE_API_KEY` for metadata, comments, and search, with either transport. Transcript tools always use unofficial `youtube-transcript-plus` access and do not use that key. The project does not distribute or host shared YouTube credentials. See [access methods and service terms](docs/access-and-compliance.md).

In HTTP mode, the existing optional `API_TOKEN` protects the MCP endpoint; it is separate from `YOUTUBE_API_KEY`. Both values are read from the process environment and are not persisted by the server. Set `API_TOKEN` whenever the HTTP endpoint is reachable by anyone other than you, and serve it behind TLS.
