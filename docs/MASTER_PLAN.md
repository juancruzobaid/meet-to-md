# Master Plan — Meet to MD

## Product Vision
A lean, private, open source Chrome extension that turns every Google Meet into a structured Markdown note in Obsidian. Zero data leaves the device. No AI, no subscriptions, no accounts. Just the transcript, your vault, your pipeline.

## Current Project Status
**Phase:** Firefox/Zen compatibility done (pending manual validation in Día and Zen) — next: AMO signing (unlisted, "On your own")
**Last Update:** 2026-11-20
**Features running:** Google Meet only. Chromium (Chrome, Día) and Firefox ≥140 / Zen from one codebase. MD export with YAML frontmatter (saves to Downloads/meet-to-md/), auto/manual mode, webhooks, meeting history, live side panel / sidebar. No telemetry, no remote fonts.

## Feature Roadmap

### ✅ COMPLETED (inherited from TranscripTonic)
#### Caption scraping — Google Meet
- **Description:** MutationObserver captures speaker + text + timestamp from Meet captions DOM
- **Main Files:** `extension/content-google-meet.js`

#### Meeting lifecycle management
- **Description:** Detects meeting start/end, saves to storage, triggers export
- **Main Files:** `extension/background.js`

#### TXT export
- **Description:** Downloads transcript as plain text file via chrome.downloads
- **Main Files:** `extension/background.js` → `downloadTranscript()`

#### Auto/manual mode
- **Description:** Auto mode captures all meetings; manual requires user to enable CC
- **Main Files:** `extension/popup.js`, `extension/background.js`

#### Webhook integration
- **Description:** Posts transcript to a user-configured URL after meeting ends
- **Main Files:** `extension/background.js` → `postTranscriptToWebhook()`

#### Meeting history
- **Description:** Stores last 10 meetings, allows manual download and webhook retry
- **Main Files:** `extension/meetings.html`, `extension/meetings.js`

#### Fork setup
- **Description:** Repo forked, upstream remote added, docs/ folder initialized
- **Completed:** 2025-03-29

#### Project documentation
- **Description:** Created PROJECT_CONTEXT, MASTER_PLAN, BUSINESS_LOGIC, IMPLEMENTATION_LOG
- **Completed:** 2025-03-29

#### MD generator
- **Description:** Created `extension/export/md-generator.js` with `generateMdFilename()` and `generateMdContent()`. Outputs YAML frontmatter (date, meeting_id, language, participants, duration_minutes) + structured Markdown transcript.
- **Main Files:** `extension/export/md-generator.js`
- **Completed:** 2026-03-29

#### Replace TXT export
- **Description:** Wired `md-generator.js` into `downloadTranscript()` in `background.js`. Extension now downloads `.md` files to `meet-to-md/` folder instead of `.txt` to `TranscripTonic/`.
- **Main Files:** `extension/background.js` → `downloadTranscript()`
- **Completed:** 2026-03-29

#### EN/ES toggle in popup
- **Description:** Prominent EN/ES toggle in popup UI. Saves `captionLanguage` to `chrome.storage.sync`. Active button highlighted, persists across sessions.
- **Main Files:** `extension/popup.html`, `extension/popup.js`
- **Completed:** 2026-03-29

#### Language in frontmatter
- **Description:** Selected language recorded in MD YAML `language:` field. Already wired via `background.js` → `md-generator.js`.
- **Completed:** 2026-03-29

#### Language switcher content script
- **Description:** When user clicks EN/ES in the "This meeting" row, the content script automates Meet's Settings UI: opens Settings → clicks Captions tab → opens language dropdown → selects the target language → closes dialog. ~2 seconds end-to-end.
- **Main Files:** `extension/language/language-switcher.js` (standalone module), `extension/content-google-meet.js` (inlined + message listener), `extension/popup.js` (`triggerMeetLanguageSwitch()`)
- **Completed:** 2026-03-29

#### Remove Zoom/Teams, dead code and upstream telemetry
- **Description:** Deleted Teams/Zoom content scripts, Zoom redirect ruleset (`rules.json`) and their permissions; removed the unused daily-permission-check alarm; removed upstream telemetry (`script.google.com`), remote status check and remote logo. Fixed the download fallback (now awaited, rejects with 009) and the webhook-failure notification listener leak (single top-level listener, notification only if permission granted). Extension renamed to "Meet to MD".
- **Main Files:** `extension/manifest.json`, `extension/background-script/*`, `extension/content-scripts/common-*.js`, `extension/popup/*`, `extension/meetings.js`, `types/index.js`
- **Completed:** 2026-11-19

#### Firefox/Zen compatibility, bundled fonts, Meet to MD branding
- **Description:** Same codebase and manifest load in Chromium and Firefox ≥140 / Zen: dual background declaration, `sidebar_action`, gecko settings with `data_collection_permissions`, blob: downloads in Firefox, permission requests inside UI click handlers, Meet access warning + Grant access button, `runtime.onStartup` re-registration, sidebar hint in Firefox. TASA Explorer bundled locally (no Google Fonts). User-visible branding is "Meet to MD"; README rewritten with install steps for both browser families.
- **Main Files:** `extension/manifest.json`, `extension/background-script/*`, `extension/shared/meet-access.js`, `extension/popup/*`, `extension/meetings.*`, `extension/fonts/*`, `README.md`
- **Completed:** 2026-11-20 (static validation only — pending manual validation in Día and Zen)

### 🚧 IN PROGRESS

#### AMO signing (Firefox permanent install)
- **Description:** Sign `meet-to-md-firefox.zip` as an unlisted add-on on addons.mozilla.org ("On your own") and install the signed .xpi in Zen.
- **Status:** Next task. Blocked on manual validation of the Firefox build.

### ❌ DECIDED AGAINST

#### Zoom / Teams support
- **Reason:** Owner only uses Google Meet. Upstream Teams/Zoom code removed to reduce surface area and permissions.
- **Removed:** 2026-11-19


#### Silent mode (hide captions overlay)
- **Reason:** `display: none` on `.a4cQT` causes Meet to stop updating the captions DOM entirely, so MutationObserver receives no mutations and the transcript stays empty. The feature breaks core functionality.
- **Implemented then reverted:** 2026-03-29

#### File System Access API — Obsidian folder picker
- **Reason:** Requires the popup to be open when the meeting ends for permission re-authorization after browser restart. Fragile UX that doesn't fit how the extension works. Files always save to `Downloads/meet-to-md/` via `chrome.downloads`. Users can set up OS-level automation to move files to their Obsidian vault.
- **Implemented then reverted:** 2026-03-29

#### Low Priority / Nice to Have
- [ ] **MEET-DOM.md:** Document Meet language settings DOM selectors for the language switcher.
- [x] **README update:** Replace TranscripTonic README with Meet to MD description, fork attribution, install instructions. (Done 2026-11-20)
- [ ] **Webhook consent check (Firefox):** skip auto-posting if the user revoked the optional data-collection consent in about:addons.
- [ ] **Custom filename pattern:** Let user configure the MD filename format in settings.

## Component Architecture Map

### Backend
- **`background.js`** — `downloadTranscript()` is our main modification target. `processLastMeeting()` orchestrates the full export flow.
- **`extension/export/md-generator.js`** (NEW) — `generateMdContent(meeting)` and `generateMdFilename(meeting)`

### Frontend
- **`popup.html` / `popup.js`** — Add language toggle (EN/ES). Minimal change.
- **`extension/language/language-switcher.js`** (NEW) — DOM interaction to change Meet caption language.

## Upstream Sync
- Remote: `git remote add upstream https://github.com/vivek-nexus/transcriptonic`
- Sync: `git fetch upstream && git merge upstream/main`
- Conflicts expected only in `background.js` (around `downloadTranscript`) and `popup.html/js`
