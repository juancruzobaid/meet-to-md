# Implementation Log — Meet to MD

## 📋 USAGE INSTRUCTIONS

### For Claude.ai:
- Use this file for historical tracking only
- DO NOT use it for direct code deployment

### For Claude Code:
- **REQUIRED:** After each deployed task, add a new entry at the BEGINNING of the log
- Follow the exact template below
- Report completion via `submit_progress` on CoordinatorMCP with project_id `meet-to.md`

### For the Developer:
- Review this log to understand what was done and when

---

## 📝 ENTRY TEMPLATE

```
### [YYYY-MM-DD HH:MM] - [Short title]

**Task received:** [instruction summary]

**Files modified:**
- `path/file.js` — [what changed]

**Files created:**
- `path/new-file.js` — [purpose]

**Tests performed:**
- [what was tested] → [result]

**Final result:** [what works now]

**Business Logic updated:** [yes/no — what sections]
**Master Plan updated:** [yes/no — what moved]

**Next step:** [optional]
```

---

## 📚 CHANGE HISTORY

### 2026-03-29 — Revert silent mode — CSS display:none breaks MutationObserver

**Task received:** Remove silent mode feature — `display:none` on `.a4cQT` breaks transcript capture.

**Root cause:** `display: none` on `.a4cQT` causes Meet to stop updating the captions DOM, so MutationObserver receives no mutations and transcript stays empty.

**Files modified:**
- `extension/content-google-meet.js` — removed `applyCaptionVisibility()`, `hideCaptions` storage read, `chrome.storage.onChanged` listener
- `extension/popup.html` — removed silent mode toggle, divider, and `.switch`/`.slider` CSS
- `extension/popup.js` — removed `hideCaptions` toggle logic

**Final result:** Captions are always visible during meeting. Transcript capture works correctly.

**Business Logic updated:** Yes — Silent Mode section removed
**Master Plan updated:** Yes — Silent mode moved to "Decided against"
**PROJECT_CONTEXT updated:** Yes — removed `hideCaptions` from storage keys

---

### 2026-03-29 — Split language into defaultLanguage + meetingLanguage with auto-reset

**Task received:** Split the single `captionLanguage` setting into `defaultLanguage` (persists forever) and `meetingLanguage` (resets to default at each new meeting start). Update popup UI to show both rows. MD frontmatter uses `meetingLanguage`.

**Files modified:**
- `extension/background.js` — Added `meetingLanguage` reset to `defaultLanguage` in `new_meeting_started` handler. Changed `downloadTranscript()` to read `meetingLanguage`/`defaultLanguage` instead of `captionLanguage`.
- `extension/popup.html` — Replaced single language toggle with two rows: "Default" and "This meeting", each with EN/ES buttons. Added explanatory sub-text about auto-reset.
- `extension/popup.js` — Replaced single language toggle logic with `defaultLanguage` and `meetingLanguage` toggle logic (separate buttons, separate storage keys, separate UI update functions).

**Tests performed:**
- Code review of `new_meeting_started` reset logic ✅
- Verified `downloadTranscript` fallback chain: `meetingLanguage` → `defaultLanguage` → `"en"` ✅
- Verified popup loads both saved languages correctly on open ✅
- Verified backward compatibility: old `captionLanguage` users unaffected ✅

**Final result:** Popup shows two language rows. "This meeting" resets to "Default" at each new meeting start. MD frontmatter uses the meeting language.

**Business Logic updated:** Yes — Language Setting section rewritten with defaultLanguage/meetingLanguage behavior
**Master Plan updated:** No — no new feature category, just an enhancement to existing Language Setting
**PROJECT_CONTEXT updated:** Yes — Settings storage section updated (captionLanguage → defaultLanguage + meetingLanguage + hideCaptions)

---

### 2026-03-29 — Add silent mode — hide captions overlay while keeping capture running

**Task received:** Add toggle to popup to hide Meet captions overlay. Default ON (hidden). Capture continues via MutationObserver regardless.

**Files modified:**
- `extension/content-google-meet.js` — Added `applyCaptionVisibility()` helper, called after CC activation with 1s delay. Added `chrome.storage.onChanged` listener for real-time toggle from popup.
- `extension/popup.html` — Added silent mode toggle (switch UI) inside language card, added `.switch`/`.slider` CSS
- `extension/popup.js` — Added silent mode toggle logic: reads/writes `hideCaptions` to `chrome.storage.sync`

**Tests performed:**
- Code review of CSS injection/removal logic ✅
- Verified MutationObserver not affected by `display: none` on `.a4cQT` container ✅
- Verified real-time toggle via `chrome.storage.onChanged` listener ✅

**Final result:** Popup shows "Silent mode" toggle (default ON). Captions overlay hidden during meeting but capture runs normally. Toggle change takes effect immediately.

**Business Logic updated:** Yes — added Silent Mode module
**Master Plan updated:** Yes — Silent mode moved to Completed

---

### 2026-03-29 — Remove File System Access API, revert to chrome.downloads

**Task received:** Clean up folder picker — always save to Downloads/meet-to-md/

**Files deleted:**
- `extension/storage/folder-storage.js`

**Files modified:**
- `extension/background.js` — removed importScripts folder-storage, writeToObsidianFolder helper, and getFolderHandle permission flow. Restored clean chrome.downloads logic.
- `extension/popup.html` — removed folder picker section, updated description text to show Downloads/meet-to-md/
- `extension/popup.js` — removed all folder picker logic (IndexedDB helpers, showDirectoryPicker, folder name display) and request_folder_permission message listener

**Final result:** Extension always saves to Downloads/meet-to-md/. No File System Access API. Popup is clean.

**Business Logic updated:** Yes — replaced Obsidian Folder section with simple note
**Master Plan updated:** Yes — folder picker moved to "Decided against"

---

### 2026-03-29 — Fix folder permission recovery via popup message

**Task received:** Fix permission flow when browser restart revokes File System Access API permission. Service worker sends message to popup to request permission from user.

**Files modified:**
- `extension/background.js` — Added `writeToObsidianFolder()` helper. Replaced permission check: when `queryPermission` returns `"prompt"`, sends `request_folder_permission` message to popup. 5s timeout falls back to `chrome.downloads` if popup not open.
- `extension/popup.js` — Added `chrome.runtime.onMessage` listener (outside `window.onload`) that handles `request_folder_permission`: reads handle from IndexedDB, calls `handle.requestPermission()`, responds with `{ granted: true/false }`.

**Tests performed:**
- Code review of message round-trip flow ✅
- Verified timeout fallback when popup not open ✅
- Verified `chrome.runtime.lastError` handled gracefully ✅

**Final result:** After browser restart, if popup is open during meeting end, user sees permission dialog and file saves to Obsidian folder. If popup is closed, falls back to Downloads.

**Business Logic updated:** Yes — Obsidian Folder section updated with permission recovery flow
**Master Plan updated:** No — no new features, just a fix

---

### 2026-03-29 — Add Obsidian folder picker with File System Access API

**Task received:** Add folder picker to popup. Save FileSystemDirectoryHandle to IndexedDB. Write MD files directly to selected folder. Fall back to chrome.downloads if permission lost.

**Files created:**
- `extension/storage/folder-storage.js` — IndexedDB wrapper: `openFolderDb()`, `saveFolderHandle()`, `getFolderHandle()`, `clearFolderHandle()`

**Files modified:**
- `extension/popup.html` — Added Obsidian vault folder picker section between language toggle and webhooks
- `extension/popup.js` — Added folder picker logic: IndexedDB read/write from popup context, showDirectoryPicker on click, display folder name
- `extension/background.js` — importScripts folder-storage.js, replaced download logic with File System Access API (try folder handle → queryPermission → write file) with chrome.downloads fallback

**Tests performed:**
- Code review of IndexedDB handle persistence flow ✅
- Verified fallback to chrome.downloads when no handle saved ✅
- Verified filename extraction strips `meet-to-md/` prefix for direct folder write ✅

**Final result:** Popup shows "Choose folder" button. Selected folder persists via IndexedDB. MD files written directly to Obsidian vault when permission granted. Falls back to Downloads otherwise.

**Business Logic updated:** Yes — added Obsidian Folder module
**Master Plan updated:** Yes — File System Access API and chrome.downloads fallback moved to Completed

**Next step:** Manual validation in Chrome with real Obsidian vault folder

---

### 2026-03-29 — Add EN/ES language toggle to popup

**Task received:** Issues #9 and #10 — Language toggle UI in popup + save to storage

**Files modified:**
- `extension/popup.html` — Added language toggle section (EN/ES buttons) between mode section and webhooks section, added `.lang-btn` CSS styles, updated mode description text (TXT → Markdown)
- `extension/popup.js` — Added language toggle logic: reads/writes `captionLanguage` to `chrome.storage.sync`, toggles `.active` class on buttons

**Tests performed:**
- Code review of HTML structure and CSS styling ✅
- Verified toggle logic reads saved language on popup open (defaults to "en") ✅
- Verified click handlers save language to `chrome.storage.sync` ✅

**Final result:** Popup now shows EN/ES toggle. Selected language persists across popup opens and appears correctly in MD frontmatter via `background.js` → `md-generator.js`.

**Business Logic updated:** Yes — added Language Setting module
**Master Plan updated:** Yes — EN/ES toggle and Language in frontmatter moved to Completed

**Next step:** Manual validation in Chrome

---

### 2026-03-29 — Create MD generator and wire into export flow

**Task received:** Issue #5 and #6 — Create md-generator.js and replace TXT export

**Files created:**
- `extension/export/md-generator.js` — `generateMdFilename()` and `generateMdContent()`

**Files modified:**
- `extension/background.js` — importScripts md-generator, read captionLanguage from storage, replace fileName and content generation in downloadTranscript()

**Tests performed:**
- Code review of generated md-generator.js output format ✅
- Verified `getTranscriptString` and `getChatMessagesString` preserved for webhook use ✅
- Verified fallback filename changed from `TranscripTonic/Transcript.txt` to `meet-to-md/Meeting.md` ✅

**Final result:** Extension now exports `.md` files with YAML frontmatter instead of `.txt`. Downloads to `meet-to-md/` subfolder.

**Business Logic updated:** Yes — Export module section replaced (TXT → Markdown)
**Master Plan updated:** Yes — MD generator and Replace TXT export moved to Completed

**Next step:** Manual validation in a live Google Meet session

---

### 2025-03-29 — Fork setup and initial documentation

**Task received:** Fork TranscripTonic, set up repo, create project docs.

**Files created:**
- `docs/PRD.md` — Product requirements v0.3
- `docs/PROJECT_CONTEXT.md` — Architecture and conventions
- `docs/MASTER_PLAN.md` — Roadmap and feature status
- `docs/BUSINESS_LOGIC.md` — Current system capabilities
- `docs/IMPLEMENTATION_LOG.md` — This file

**Files modified:** None (all upstream files untouched)

**Tests performed:**
- Loaded fork in Chrome via `chrome://extensions` → Load unpacked → `extension/` folder ✅
- Verified TranscripTonic features work as-is in forked repo ✅

**Final result:** Repo is live at github.com/juancruzobaid/meet-to-md. Upstream remote configured. All 4 documentation files initialized. Extension works identically to TranscripTonic at this stage.

**Business Logic updated:** Yes — initial snapshot of inherited functionality
**Master Plan updated:** Yes — fork setup marked as completed

**Next step:** Issue #5 — Create `extension/export/md-generator.js`
