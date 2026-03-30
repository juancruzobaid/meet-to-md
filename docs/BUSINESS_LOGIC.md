# Business Logic — Meet to MD

## 📋 USAGE INSTRUCTIONS

### For Claude.ai:
- Read this file to understand what the system does BEFORE planning changes
- Check here first for dependencies before planning a new feature

### For Claude Code:
- **REQUIRED:** After every task that adds/modifies functionality, update the relevant sections
- Only document what IS implemented, never what WILL BE
- If a feature is removed, remove it from this file

### For the Developer:
- Use this as a quick reference to understand what the extension currently does

---

## System Overview
Meet to MD is a Chrome extension that captures Google Meet captions in real time and saves them as Markdown files. It is a fork of TranscripTonic with added Obsidian-friendly output. All processing is local — no data leaves the device.

## User Roles
### Extension user (meeting participant)
- **Can do:** capture transcripts, configure auto/manual mode, download MD files, post to webhook, review last 10 meetings, retry failed webhooks
- **Cannot do:** capture without CC enabled, capture audio (text only from captions)

---

## Modules

### Caption Capture (upstream — Google Meet)
**Purpose:** Detect meeting start/end and capture captions in real time.

**What the user can do:**
- Auto mode: extension captures all meetings automatically when CC is active
- Manual mode: user controls when capture starts by enabling CC manually

**Business rules:**
- Capture only works when Google Meet captions (CC) are active
- Speaker name defaults to "You" if the user's name cannot be resolved before meeting starts
- When the same speaker talks for >30 min without pause, Meet drops the buffer — extension detects this and saves the long block before it's lost
- Transcript recovery runs on page load to recover any missed transcript from the previous meeting

**Connections:** Writes to `chrome.storage.local` → triggers Background export on meeting end

---

### Export — Markdown (replaces TXT)
**Purpose:** Download transcript as a structured Markdown file with YAML frontmatter at meeting end.

**What the user can do:**
- Receive a `.md` file automatically when the meeting ends (auto mode)
- Download manually from meeting history

**Business rules:**
- File saved to `meet-to-md/` subfolder in the browser's default Downloads directory
- Filename format: `meet-to-md/YYYY-MM-DD [Meeting Title].md`
- If filename is invalid, falls back to `meet-to-md/Meeting.md`
- Last 10 meetings are kept in storage; older ones are dropped
- YAML frontmatter includes: date, meeting_id, language, participants, duration_minutes, source
- Participants are deduplicated and sorted alphabetically from transcript speaker names
- Duration calculated as whole minutes between meeting start and end timestamps
- Language read from `chrome.storage.sync` key `captionLanguage` (default: `"en"`)
- Chat messages section only included if chat messages exist
- No branding footer

**Current output format (Markdown):**
```markdown
---
date: 2025-03-29
meeting_id: ""
language: en
participants:
  - Donna
  - Juan Cruz
duration_minutes: 45
source: Google Meet captions
---

# Weekly Sync — March 29, 2025

## Transcript

**Juan Cruz** (10:02): Good morning...

**Donna** (10:03): Yes, I reviewed...

## Chat Messages

**Juan Cruz** (10:45): Here's the link...
```

**Implementation files:** `extension/export/md-generator.js` → `generateMdFilename()`, `generateMdContent()`

---

### Language Setting (popup UI)
**Purpose:** Let the user set the caption language before or during a meeting.

**What the user can do:**
- Toggle between EN and ES using two prominent buttons in the popup
- Selected language persists across popup opens and browser sessions

**Business rules:**
- Language stored in `chrome.storage.sync` key `captionLanguage`
- Default value is `"en"` if not set
- The active button is highlighted with filled background (`#2A9ACA`), inactive is outlined
- The selected language is used in the MD YAML frontmatter (`language:` field)
- This toggle does NOT change Meet's caption language via DOM — the user must still set Meet's CC language manually in Meet settings

**Connections:** `chrome.storage.sync.captionLanguage` → read by `background.js` → passed to `generateMdContent()` in `md-generator.js`

---

### Obsidian Folder (File System Access API)
**Purpose:** Let the user choose their Obsidian vault folder so MD files are saved directly there instead of Downloads.

**What the user can do:**
- Click "Choose folder" in the popup to select any folder via the system file picker
- Selected folder name is displayed in the popup with a folder icon
- If no folder is selected, files go to the Downloads folder as before

**Business rules:**
- `FileSystemDirectoryHandle` stored in IndexedDB (not JSON-serializable, cannot use `chrome.storage`)
- IndexedDB database: `meet-to-md-storage`, object store: `folder-handles`, key: `obsidian-folder`
- On meeting end, `downloadTranscript()` attempts to use saved handle:
  1. Reads handle from IndexedDB via `getFolderHandle()`
  2. Calls `handle.queryPermission({ mode: "readwrite" })`
  3. If `"granted"` → writes file directly to folder via `writeToObsidianFolder()` (filename without `meet-to-md/` prefix)
  4. If `"prompt"` (permission revoked after browser restart) → sends `request_folder_permission` message to popup
     - If popup is open: popup reads handle from IndexedDB, calls `handle.requestPermission({ mode: "readwrite" })` which shows browser permission dialog. Responds `{ granted: true/false }`.
     - If popup is closed: message has no receiver — 5-second timeout triggers fallback
  5. If no handle, permission denied, or timeout → falls back to `chrome.downloads` (file goes to `meet-to-md/` subfolder in Downloads)
- The popup context uses inline IndexedDB helpers (cannot use `importScripts` outside service worker)
- The `requestPermission()` call requires a user gesture context (browser window) — this is why the popup must handle it, not the service worker

**Connections:** `popup.js` saves handle → IndexedDB ← `background.js` reads handle → writes file or asks popup for permission → falls back to `chrome.downloads`

---

### Webhook Integration (upstream)
**Purpose:** Post transcript data to an external URL after each meeting.

**What the user can do:**
- Configure a webhook URL in settings
- Choose between simple (formatted strings) or advanced (raw arrays) body format
- Retry failed webhooks from meeting history

**Business rules:**
- Webhook posts automatically after meeting if URL is configured and auto-post is enabled
- Simple body: transcript and chatMessages as formatted strings
- Advanced body: transcript and chatMessages as raw arrays of objects
- Failed webhooks are flagged in meeting history for manual retry

---

### Meeting History (upstream)
**Purpose:** Review and re-download last 10 meetings.

**What the user can do:**
- View list of last 10 meetings with title, date, and status
- Download any meeting's transcript manually
- Retry webhook for failed posts

**Business rules:**
- Maximum 10 meetings stored — oldest dropped when limit exceeded
- Webhook status tracked per meeting: `new`, `successful`, `failed`

---

## Data Formats and Conventions
- Timestamps stored in ISO 8601 UTC format (`meetingStartTimestamp`, `meetingEndTimestamp`, per-block `timestamp`)
- Display timestamps formatted with `Intl.DateTimeFormatOptions` → `MM/DD/YYYY, HH:MM AM/PM`
- Meeting title sanitised to remove invalid filename characters before use in filenames
- `chrome.storage.local` used for transient meeting data and history
- `chrome.storage.sync` used for persistent user settings (synced across devices)
