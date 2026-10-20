# YouTube MCP v1.1.1

A patch release improving provider/access documentation. Runtime behavior and
MCP tool/API compatibility are unchanged from 1.1.0.

## Install

Run the exact version with Node.js 22 or newer:

```bash
npx -y @granitebps/youtube-mcp@1.1.1
```

See the
[client configuration guide](https://github.com/granitebps/youtube-mcp/blob/v1.1.1/README.md#client-configuration)
for setup examples.

## Changes

- Made the independent, unofficial project status explicit: no affiliation,
  endorsement, or sponsorship by YouTube or Google.
- Clarified that the default InnerTube provider uses an unofficial/internal
  YouTube interface through `youtubei.js` for metadata, comments, and search.
- Disclosed that transcript tools always use unofficial `youtube-transcript-plus`
  access, including when `YT_PROVIDER=api` is selected.
- Clarified official YouTube Data API v3 setup with the user's own
  `YOUTUBE_API_KEY` (BYOK). The project does not distribute or host a shared key.
- Added an [access guide](https://github.com/granitebps/youtube-mcp/blob/v1.1.1/docs/access-and-compliance.md)
  with the tool/backend mapping, operational limitations, direct dependency
  license findings, and the distinction between software licenses and service
  terms.

## Compatibility

No changes to runtime behavior, default provider, tool names, inputs, outputs, or
error contracts. The reported server version becomes 1.1.1. InnerTube, the
official API provider, and transcript support remain available under the existing
[v1 compatibility contract](https://github.com/granitebps/youtube-mcp/blob/v1.1.1/docs/v1-compatibility.md).

## Known limitations

- Unofficial access can change, break, be restricted, or be blocked. Selecting the
  official provider does not change the transcript access path or prevent
  transcript access failures.
- Official API calls require the user's valid key and remain subject to project
  quotas, key restrictions, and applicable service terms.
- Caption availability, manual-track selection when manual and automatic tracks
  share a language, and partial comment replies are unchanged.
- `youtube-transcript-plus@2.0.0` declares MIT but omits its license file from the
  published package; see the access guide for upstream notice and redistribution
  details.

The project remains ISC licensed. This release is informational; it does not
certify legal compliance or commercial suitability. Users remain responsible for
applicable service terms and law.
