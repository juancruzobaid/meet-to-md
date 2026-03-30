# Master Plan — Meet to MD

## Product Vision
A lean, private, open source Chrome extension that turns every Google Meet into a structured Markdown note in Obsidian. Zero data leaves the device. No AI, no subscriptions, no accounts. Just the transcript, your vault, your pipeline.

## Current Project Status
**Phase:** Phase 0 completed — Fork set up, docs being initialized
**Last Update:** 2025-03-29
**Features running:** All TranscripTonic features (TXT export, auto/manual mode, webhooks, meeting history)

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

### 🚧 IN PROGRESS
#### Project documentation
- **Description:** Creating PROJECT_CONTEXT, MASTER_PLAN, BUSINESS_LOGIC, IMPLEMENTATION_LOG
- **Progress:** In progress (this task)
- **Next Step:** Commit docs to repo

### 📋 PRIORITIZED BACKLOG

#### High Priority
- [ ] **MD generator:** Replace TXT export with Markdown + YAML frontmatter. Output: date, meeting_id, language, participants, duration_minutes, structured transcript and chat messages.
- [ ] **Replace TXT export:** Wire `md-generator.js` into `downloadTranscript()` in `background.js`.
- [ ] **File System Access API:** Let user pick destination folder (Obsidian vault). Add folder picker to settings. Persist handle across sessions.
- [ ] **chrome.downloads fallback:** If File System Access API is unavailable, fall back to current download method.

#### Medium Priority
- [ ] **Language switcher content script:** Trigger Meet caption language change via DOM interaction.
- [ ] **EN/ES toggle in popup:** Prominent toggle in popup UI, always visible during meeting.
- [ ] **Language in frontmatter:** Record selected language in MD YAML.

#### Low Priority / Nice to Have
- [ ] **MEET-DOM.md:** Document Meet language settings DOM selectors for the language switcher.
- [ ] **README update:** Replace TranscripTonic README with Meet to MD description, fork attribution, install instructions.
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
