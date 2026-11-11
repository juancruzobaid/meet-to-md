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
**Purpose:** Let the user set a default caption language and override it per meeting.

**What the user can do:**
- Set a **default language** (EN/ES) that persists forever
- Set a **meeting language** (EN/ES) that applies to the current/next meeting
- Meeting language automatically resets to default when a new meeting starts

**Business rules:**
- Two storage keys replace the old `captionLanguage`:
  - `defaultLanguage` — user's preferred language, persists forever. Default: `"en"`
  - `meetingLanguage` — language for the current/next meeting. Default: falls back to `defaultLanguage`
- When `background.js` receives `new_meeting_started`, it resets `meetingLanguage` to `defaultLanguage`
- The active button is highlighted with filled background (`#2A9ACA`), inactive is outlined
- Popup shows two rows: "Default" and "This meeting", each with EN/ES buttons
- The `meetingLanguage` value is used in the MD YAML frontmatter (`language:` field)
- When the user clicks a "This meeting" language button, the popup also sends a `switch_meet_language` message to the Meet content script, which automates Meet's Settings UI to change the caption language in real time (Settings → Captions → language dropdown → select → close)
- The language switcher uses DOM selectors: `[aria-label="Settings"]`, `[jsname="FbBif"]` (dropdown), `[role="option"]` (language options)
- If no Meet tab is active or the switcher fails, the storage value is still saved — only the live Meet switch is skipped
- Migration: users with old `captionLanguage` key are unaffected — `downloadTranscript` falls back to `defaultLanguage` then `"en"`

**Connections:** `chrome.storage.sync.meetingLanguage` → read by `background.js` → passed to `generateMdContent()` in `md-generator.js`. `background.js` resets `meetingLanguage` on `new_meeting_started`. `popup.js` → `chrome.tabs.sendMessage` → `content-google-meet.js` → `switchMeetCaptionLanguage()`.

---

---

### File Output Location
**Purpose:** MD files are always saved to a predictable location.

**Business rules:**
- MD files are always saved to `Downloads/meet-to-md/` via `chrome.downloads` API
- Users can set up OS-level automation (macOS Automator, Folder Actions, Hazel, etc.) to move files from `Downloads/meet-to-md/` to their Obsidian vault
- File System Access API was evaluated and removed — it required the popup to be open when the meeting ends for permission re-authorization after browser restart, which is a fragile UX requirement

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
