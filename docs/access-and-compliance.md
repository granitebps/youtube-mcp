# Access methods and service terms

YouTube MCP is an independent, unofficial open-source project. It is not
affiliated with, endorsed by, or sponsored by YouTube or Google. This document
describes the implementation and its limitations. It is informational, not legal
advice, and does not certify compliance or suitability for commercial use.

## Providers and tool backends

`YT_PROVIDER` selects a provider only for metadata, comments, and search.
`innertube` is the default; `api` is an explicit opt-in. There is no automatic
fallback between them.

| Tool | `YT_PROVIDER=innertube` (default) | `YT_PROVIDER=api` |
|------|---------------------------------|-------------------|
| `get_video_info` | `youtubei.js`, unofficial/internal InnerTube interface | Official YouTube Data API v3, `videos.list` |
| `get_video_comments` | `youtubei.js`, unofficial/internal InnerTube interface | Official YouTube Data API v3, `commentThreads.list` |
| `search_youtube` | `youtubei.js`, unofficial/internal InnerTube interface | Official YouTube Data API v3, `search.list` and `videos.list` |
| `get_video_transcript` | `youtube-transcript-plus`, unofficial caption access | Same unofficial backend; does not use the Data API or your key |
| `get_transcript_languages` | `youtube-transcript-plus`, unofficial caption access | Same unofficial backend; does not use the Data API or your key |
| `get_server_info` | Local configuration and backend information | Local configuration and backend information |

`get_server_info` reports the selected provider and each tool's backend without
making a YouTube request. Its `authenticated` field describes the selected
provider's use of credentials; it does not mean transcript access is official.

## Official API setup: bring your own key

Create your own Google Cloud project, enable YouTube Data API v3, and create an
API key in the [Google Cloud console](https://console.cloud.google.com/).
Restrict the key to the API and your deployment where applicable. Configure the
server's environment with both settings:

```text
YT_PROVIDER=api
YOUTUBE_API_KEY=<your-own-youtube-data-api-key>
```

The key belongs to the user. The project does not distribute or host a shared
YouTube API key or provide a credential proxy. Supply the key through your MCP
client's environment settings or deployment's secret configuration, and keep it
out of source control. These are environment settings; merely creating a `.env`
file does not load it into this server.

The server requires a nonempty key at startup in API mode and ignores it in
InnerTube mode. The official provider sends the key in the `X-Goog-Api-Key`
header. API availability remains subject to key restrictions, project quotas,
network conditions, and applicable terms. See the [provider guide](../README.md#providers)
for quota usage and differences in dates, search filters, and results.

## Transcripts remain unofficial with either provider

Both transcript tools always use `youtube-transcript-plus`. The implementation
fetches the watch page, an internal player response, and, for retrieval, a caption
track. It does not use YouTube Data API caption endpoints or `YOUTUBE_API_KEY`.
Selecting `api` therefore does not make all tool access official.

The official [caption-download endpoint](https://developers.google.com/youtube/v3/docs/captions/download)
requires OAuth authorization and permission to edit the video. This server does
not implement that flow. Transcript results are caption text, not analysis of
video frames. Captions may be absent; when a language has both manual and
automatic tracks, the server selects the manual track.

## Operational limits

Unofficial interfaces can change or break without notice. YouTube may restrict,
rate-limit, require sign-in, or block access, including from cloud or VPS IPs.
An API key does not remove these limitations from transcript tools. Request
pacing and this documentation do not establish permission to use an interface.

Access failures are returned using the existing error contracts, including
`ACCESS_BLOCKED`; they are not reported as missing captions. Layout changes may
cause parsing errors. The server does not retry failed upstream requests
automatically. Provider-specific search differences and partial comment replies
are documented in the [README](../README.md#tool-details).

## Software licenses and service terms

The project's [ISC license](../LICENSE) permits use, copying, modification, and
distribution for any purpose, with or without fee, provided its copyright and
permission notices appear in all copies. The project license is unchanged.

The following direct production dependency versions are resolved by the lockfile
for 1.1.1. Each declares MIT in its version-specific npm metadata. The published
packages include MIT license text except as noted below.

| Dependency | Resolved version | License and authoritative sources |
|------------|------------------|-----------------------------------|
| `youtubei.js` | 18.1.0 | MIT: [npm metadata](https://registry.npmjs.org/youtubei.js/18.1.0), package `LICENSE` |
| `youtube-transcript-plus` | 2.0.0 | MIT: [npm metadata](https://registry.npmjs.org/youtube-transcript-plus/2.0.0), [current upstream license](https://github.com/ericmmartin/youtube-transcript-plus/blob/main/LICENSE) |
| `@modelcontextprotocol/sdk` | 1.32.1 | MIT: [npm metadata](https://registry.npmjs.org/@modelcontextprotocol/sdk/1.32.1), package `LICENSE` |
| `express` | 5.2.1 | MIT: [npm metadata](https://registry.npmjs.org/express/5.2.1), package `LICENSE` |
| `express-rate-limit` | 8.7.1 | MIT: [npm metadata](https://registry.npmjs.org/express-rate-limit/8.7.1), package `license` |
| `zod` | 4.3.6 | MIT: [npm metadata](https://registry.npmjs.org/zod/4.3.6), package `LICENSE` |

MIT permits use, modification, distribution, sublicensing, and sale, subject to
including its copyright and permission notice in copies or substantial portions
of the software. These grants permit commercial use and distribution of the
software subject to those conditions. Both ISC and MIT disclaim warranties.

`youtube-transcript-plus@2.0.0` omits a license file from its published package;
its npm metadata declares MIT, and the current upstream license contains notices
for Sylvestre Bouchot and Eric Martin. The upstream license link is not a
version-pinned license file for 2.0.0. Redistributors copying dependencies should
retain their applicable license texts and notices, including this dependency's
upstream notices, and review transitive dependencies in their own distribution.
This project's npm tarball references dependencies rather than bundling their
code; no separate third-party notices file is added in this release.

Software license permissions do not grant rights to YouTube content or override
third-party service terms. Users are responsible for deciding whether an access
method suits their use and for complying with applicable terms and law. Consult
the [YouTube Terms of Service](https://www.youtube.com/static?template=terms),
[YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service),
and [developer policies](https://developers.google.com/youtube/terms/developer-policies)
as applicable. Neither a disclaimer nor choosing a provider establishes legal
compliance, approval by YouTube, or commercial suitability.
