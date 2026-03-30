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
- **Can do:** capture transcripts, configure auto/manual mode, download TXT files, post to webhook, review last 10 meetings, retry failed webhooks
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

### Export — TXT (upstream, current)
**Purpose:** Download transcript as a plain text file at meeting end.

**What the user can do:**
- Receive a `.txt` file automatically when the meeting ends (auto mode)
- Download manually from meeting history

**Business rules:**
- File saved to `TranscripTonic/` subfolder in the browser's default Downloads directory
- Filename format: `TranscripTonic/[Software] transcript-[Title] at [Timestamp] on.txt`
- If filename is invalid, falls back to `TranscripTonic/Transcript.txt`
- Last 10 meetings are kept in storage; older ones are dropped
- Transcript and chat messages are included in the same file, separated by a divider

**Current output format (TXT):**
```
PersonName (DATE TIME)
Transcript text here

---------------
CHAT MESSAGES
---------------

PersonName (DATE TIME)
Message text here

---------------
Transcript saved using TranscripTonic Chrome extension (...)
---------------
```

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
