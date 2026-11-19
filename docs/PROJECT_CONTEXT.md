# Meet to MD — Project Context

## Project Purpose
Chrome extension (public fork of TranscripTonic) that captures Google Meet live captions (Google Meet only — upstream Zoom/Teams support was removed on 2026-11-19) and saves them as structured Markdown files ready for Obsidian. Adds a configurable save folder and a one-click language toggle. The DOM scraping engine is inherited from upstream and kept in sync via `git merge upstream/main`.

## CoordinatorMCP
- **project_id:** meet-to.md
- **URL:** https://mcp.juancruz.com.ar/mcp

## Upstream
- **Repo:** https://github.com/vivek-nexus/transcriptonic
- **License:** MIT
- **Sync command:** `git fetch upstream && git merge upstream/main`
- **Do not modify:** Google Meet capture logic in `extension/content-scripts/google-meet/`, `types/chrome.d.ts`
- **Removed from upstream (expect merge conflicts / re-deletions on sync):** `extension/content-scripts/teams/`, `extension/content-scripts/zoom/`, `extension/rules.json` (Zoom redirect), Teams/Zoom entries in `PLATFORM_CONFIGS` and the manifest, the `alarms` and `declarativeNetRequestWithHostAccess` permissions, all upstream telemetry (`script.google.com` logging) and the remote status check / remote logo (`ejnana.github.io`)

## Current Technology Stack
- **Extension type:** Chrome Extension Manifest V3
- **Language:** JavaScript (JSDoc typed, no TypeScript compilation step)
- **Build:** No build step — raw JS files loaded directly by Chrome
- **Storage:** `chrome.storage.local` (meeting data) + `chrome.storage.sync` (user settings)
- **File download:** `chrome.downloads` API (current) → File System Access API (planned)
- **Version Control:** GitHub — github.com/juancruzobaid/meet-to-md

## System Architecture
```
Google Meet page
     │
     ▼
content-google-meet.js          ← UPSTREAM — MutationObserver on captions DOM
     │ chrome.storage.local.set()
     ▼
background.js (service worker)  ← UPSTREAM (except downloadTranscript function)
     │
     ├── downloadTranscript()   ← OUR TARGET — replace TXT with MD
     │        │
     │        ▼
     │   md-generator.js        ← NEW — generates MD + YAML frontmatter
     │
     └── postTranscriptToWebhook()  ← UPSTREAM — keep as-is

popup.html / popup.js           ← MODIFIED — add language toggle
language-switcher.js            ← NEW — triggers Meet language change via DOM
```

## Key Files

| File | Owner | Purpose |
|---|---|---|
| `extension/content-google-meet.js` | UPSTREAM | Scrapes Meet captions DOM |
| `extension/background.js` | UPSTREAM + OUR EXPORT | Service worker, meeting lifecycle, download |
| `extension/popup.html` | MODIFIED | Popup UI — add language toggle |
| `extension/popup.js` | MODIFIED | Popup logic — add language toggle |
| `extension/meetings.html/js` | UPSTREAM | History of last 10 meetings |
| `extension/manifest.json` | UPSTREAM | Extension manifest |
| `extension/export/md-generator.js` | NEW | MD + YAML frontmatter generator |
| `extension/language/language-switcher.js` | NEW | Meet caption language DOM switcher |
| `types/index.js` | UPSTREAM | JSDoc type definitions |
| `docs/PRD.md` | OURS | Product requirements |

## Core Data Structures

### Meeting object (chrome.storage.local)
```js
{
  meetingSoftware: "Google Meet",
  meetingTitle: string,
  meetingStartTimestamp: ISO string,   // e.g. "2025-03-29T10:00:00.000Z"
  meetingEndTimestamp: ISO string,
  transcript: [
    { personName: string, timestamp: ISO string, transcriptText: string }
  ],
  chatMessages: [
    { personName: string, timestamp: ISO string, chatMessageText: string }
  ],
  webhookPostStatus: "new" | "failed" | "successful"
}
```

### Settings (chrome.storage.sync)
```js
{
  operationMode: "auto" | "manual",
  webhookUrl: string,
  autoPostWebhookAfterMeeting: boolean,
  webhookBodyType: "simple" | "advanced",
  defaultLanguage: "en" | "es",     // NEW — persists forever
  meetingLanguage: "en" | "es",     // NEW — resets to defaultLanguage on new meeting
}
```

## Meet DOM Selectors (critical — break on Google updates)

### Caption scraping (upstream, do not touch)
- CC button: `.google-symbols` with text `closed_caption_off`
- Transcript container: `div[role="region"][tabindex="0"]`
- Speaker name: `.KcIKyf.jxFHg`
- Transcript text: `.bh44bd.VbkSUe`
- Caption language settings area: `.NmXUuc.P9KVBf` (contains language controls)

### Language switching (our work — document in MEET-DOM.md)
- To be researched and documented in Phase 2

## Development Principles
- Never modify upstream files — our changes must be additive or isolated to new files
- All new files go in `extension/export/` or `extension/language/`
- Popup modifications are minimal — add only the language toggle
- Every upstream merge must be tested manually in a real Meet session
- No build step — keep it plain JS

## Coding Conventions
- **Language:** JavaScript with JSDoc type annotations (matches upstream style)
- **File names:** kebab-case
- **No frameworks:** vanilla JS only (matches upstream)
- **Comments:** English, match upstream comment style

## Network & Privacy
- The extension only talks to `meet.google.com` (content script) and the user-configured webhook URL. No telemetry, remote error logging or remote status/kill-switch checks.
- The in-page logo is the bundled `icon.png`, exposed to `https://meet.google.com/*` via `web_accessible_resources`.
- Extension pages (popup, meetings, side panel) still load the TASA Explorer font from Google Fonts (inherited from upstream).

## Known Technical Debt
- `chrome.downloads` API saves to a fixed Downloads folder — File System Access API (Phase 3) will allow saving directly to Obsidian vault
- Language switcher relies on Meet DOM selectors that can break on Google updates — isolated in its own file for easy patching
