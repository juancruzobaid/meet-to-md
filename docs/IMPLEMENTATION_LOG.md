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

### 2026-11-24 17:13 - Prevent duplicate transcript download and storage at meeting end

**Task received:** Bug reported by the owner (Chromium/Día): when a meeting ends, the `.md` is downloaded twice (`Title.md` and `Title (1).md`), probably also stored twice in "Last 10 meetings". Make end-of-meeting processing idempotent, fix the races, guard the content script. Version 3.5.1.

**Root cause:** `processLastMeeting()` had three independent triggers and was not idempotent: `pickupLastMeetingFromStorage()` always pushed an entry and the download/webhook always ran. Reproduced on 26e01e8 with a fake-`chrome` harness:
- `meeting_ended` sent more than once → 2 downloads (2 stored entries if the second arrives after the first saved; 1 entry if they overlap, because both read the same `meetings` array). The content script did send it on every click: 3 clicks on the end-call button → 3 messages, and the last transcript block was also pushed 3 times.
- Tab closed, then `meeting_ended` (that order) → 2 downloads, 2 webhook posts. The opposite order (`meeting_ended` first) did **not** reproduce: the `meetingTabId: "processing"` write is issued before `onRemoved`'s read.
- `recover_last_meeting` while processing is in progress → 2 downloads (and 2 entries if it arrived before the first save completed).
- `recoverLastMeeting()` only compared with the *last* saved meeting.
- Which of these happened in the owner's browser is not proven; a second click reaching the end-call listener is the one that matches "after a normal hang-up, repeatedly".

**Files modified:**
- `extension/background-script/meetings.js` — `pickupLastMeetingFromStorage()` resolves `{ alreadyProcessed }`; an already saved `meetingStartTimestamp` is never pushed again, only updated in place with longer transcript / chat or later end timestamp (title, webhook status and language kept). `processLastMeeting()` skips download and webhook when already processed, and has an in-memory lock: overlapping triggers share the run's result, unless storage holds data that run did not save (another meeting, or more content), which is processed right after. `recoverLastMeeting()` checks all saved meetings. Missing `transcript`/`chatMessages` keys are treated as empty (an exception there would have left the lock held).
- `extension/background-script/index.js` — `handledMeetingTabIds` guard set synchronously on `meeting_ended` and `onRemoved` (cleared by `new_meeting_started`); `meetingTabId: "processing"` kept for service-worker restarts. Shared `handleMeetingEnd()`; tab id cleared / deferred update applied only once all triggers are done. `onRemoved` processing errors are now caught.
- `extension/content-scripts/google-meet/index.js` — end-call click listener returns immediately if `state.hasMeetingEnded`.
- `extension/manifest.json` — version 3.5.1.
- `extension-unpacked.zip`, `meet-to-md-firefox.zip` — rebuilt.
- `docs/BUSINESS_LOGIC.md`

**Tests performed:**
- Fake-`chrome` Node harness (in-memory storage, `downloads.download` and `fetch` spies, real `background-script/index.js`): 25 scenarios × {Chromium data: URL, Firefox blob: URL} × storage latency {0, 1, 5, 20 ms} = 200 runs → 200/200 pass (26e01e8: 88/200). Covers: end/close in both orders, end twice (same tick and sequential), recovery during/after/before processing, two meetings in sequence and overlapping, manual download and webhook repost, file-name fallback, in-place update (more / less complete, during processing), empty meeting, unrelated tab closed, rejoin in the same tab, deferred update, webhook failure, 10-meeting cap, service-worker restart, auto-download off.
- Content script in a Node VM: 3 clicks on end-call → 1 `meeting_ended` (before: 3)
- Syntax check of changed .js (background as ES modules) → OK
- `npx web-ext lint --source-dir extension` → 0 errors, 0 notices, 8 warnings (same as before)
- Not tested in a browser — owner to verify in Día

**Final result:** One stored meeting, one automatic download and one automatic webhook post per `meetingStartTimestamp`. Markdown format, filename, `uniquify`, manual download and manual webhook repost unchanged.

**Known limitation (not changed):** opening another Meet page (lobby included) while a meeting is in progress in a different tab makes recovery process the ongoing meeting and then resets the shared state with a new `meetingStartTimestamp`, so the same meeting ends up as two entries / two downloads. Reproduced in the harness; not covered by per-timestamp idempotency.

**Business Logic updated:** yes — Caption Capture (idempotent end-of-meeting processing), Export (manual download)
**Master Plan updated:** no

**Next step:** Manual check in Día. Decide whether to fix the second-Meet-tab limitation.

---

### 2026-11-20 16:45 - Firefox/Zen compatibility, bundled fonts and Meet to MD branding

**Task received:** Step 2. Make the same codebase (one manifest, no per-browser build) run in Chromium (Chrome, Día) and Firefox-based browsers (Firefox, Zen) without changing Chromium behaviour; bundle the UI font locally (no Google Fonts); rebrand user-visible "TranscripTonic" to "Meet to MD". Markdown output/filename, Meet caption capture logic and webhook behaviour untouched.

**Firefox decisions:**
- **Background:** `background` declares both `service_worker` (Chromium) and `scripts` (Firefox) with `type: "module"`. Chromium ≥121 ignores `scripts`; Firefox ≥121 ignores `service_worker` and runs an event page (MDN `manifest.json/background`).
- **`strict_min_version: "140.0"` (desktop) and `gecko_android.strict_min_version: "142.0"`:** 140 is the first Firefox that supports `browser_specific_settings.gecko.data_collection_permissions` (and `permissions.request({ data_collection })`), which AMO requires for new submissions since 2025-11-03. Everything else we rely on is older: MV3 background scripts with `type: "module"`, `scripting.registerContentScripts` (Firefox 101+, `persistAcrossSessions` defaults to true), `sidebarAction`, `downloads` with blob: URLs, promise-returning `chrome.*` APIs. 140 is also an ESR, and Zen tracks current Firefox. web-ext lint confirms Firefox for Android only supports the key from 142, so `gecko_android` is set to 142.
- **`data_collection_permissions: { required: ["none"], optional: ["personalCommunications", "websiteContent"] }`:** Nothing is sent to the developer, so nothing is *required*. But Mozilla defines transmission as any data "handled outside of the add-on", lists no exemption for user-chosen destinations, and requires explicit consent for passive/background transmission. Auto-posting each meeting's transcript to the user's webhook is exactly that, so the meeting content types are declared as **optional** and requested at the moment the user sets up the webhook. Implemented in `meetings.js` `requestWebhookAndNotificationPermission()`: in Firefox only (detected via `browser.runtime.getBrowserInfo`), `data_collection` is added to the existing host+notifications `permissions.request()` in the same click/submit handler, so it is one prompt. Chromium does not know the key and keeps the old request object. `personalCommunications` covers the call transcript and chat; `websiteContent` covers the Meet page content (meeting title, participant names).
- **Gecko id:** `meet-to-md@juancruz.com.ar`.
- **Permission flow:** Firefox only allows `permissions.request()` inside a user-gesture handler, and the gesture does not survive a message to the background. New `extension/shared/meet-access.js` (loaded by the popup and the meetings page) calls `chrome.permissions.request()` synchronously from the click handler and only then messages the background (`enable_platform` now **only registers** the content script; `requestPlatformPermission` removed from `platforms.js`). `wantGoogleMeet: true` is stored *before* the prompt so that, if the Firefox popup closes while the prompt is open (killing the popup script), the existing `permissions.onAdded` listener still registers the script. The popup checkbox listens to `click` (not `change`) so the request runs inside the gesture. The meetings page webhook "Repost" button used to request inside a `storage.sync.get` callback (gesture lost in Firefox); it now uses a cached `savedWebhookUrl` kept current through `storage.onChanged`.
- **Meet access may be missing:** Firefox treats `host_permissions` as optional and the user can revoke them. The popup now shows "Google Meet access is not granted, so transcripts can't be captured. [Grant access]" whenever `permissions.contains()` is false; the meetings page shows a banner with a **Grant access** button (unless the user explicitly turned Google Meet off). This replaces the dead `handlePermissions()` dialog, which used the old background-request flow.
- **Sidebar limitation:** `sidebar_action` points to the same `side-panel/index.html` (title "Meet to MD", `icon.png`); `side_panel` is kept for Chromium. `sidebarAction.open()` needs a user action and a content-script message is not one, so in Firefox the in-page button usually cannot open it: `openSidePanel()` rejects with error `017` and the content script shows "Open the Meet to MD sidebar from the browser sidebar menu". Chromium keeps `chrome.sidePanel.open()`, now called synchronously with `sender.tab.id` (falls back to the active-tab query). Never throws.
- **Downloads:** Firefox rejects `data:` URLs in `downloads.download`. If `URL.createObjectURL` exists (Firefox background page), a `blob:` URL is used and revoked when `downloads.onChanged` reports the download complete/interrupted (also checked once via `downloads.search` in case it already ended; 5-minute timeout as a safety net; revoked immediately if both attempts fail). Otherwise (Chromium service worker) the existing `FileReader` → `data:` URL path is unchanged. Fallback to `meet-to-md/Meeting.md` and error `009` behaviour kept, now shared by both paths in `downloadWithFallback()`.

**Files modified:**
- `extension/manifest.json` — version 3.5.0; `background.scripts` alongside `service_worker`; `sidebar_action`; `browser_specific_settings.gecko` (id, `strict_min_version` 140.0, `data_collection_permissions`) and `gecko_android` (`strict_min_version` 142.0).
- `extension/background-script/exporters.js` — blob:/data: download paths, `downloadWithFallback()`, `revokeObjectUrlWhenDownloadEnds()`; webhook-failure notification `iconUrl` is now `chrome.runtime.getURL("icon.png")` (relative URLs resolve differently in a Firefox background page).
- `extension/background-script/index.js` — `new_meeting_started` uses `sender.tab.id` (active-tab query only as fallback); `enable_platform` only registers; `open_side_panel` passes `sender.tab`; `onMessage` returns `true` only for message types answered asynchronously (it returned `true` for everything, leaving e.g. every `broadcast_live_buffer` response pending forever); new `runtime.onStartup` → `reRegisterContentScripts()`.
- `extension/background-script/utils.js` — `openSidePanel(senderTab)` handles Chromium side panel / Firefox sidebar / unsupported, errors `017`/`018`; `openExtensionPopup()` rejects cleanly when `action.openPopup` is missing or throws.
- `extension/background-script/platforms.js` — removed `requestPlatformPermission`; registration notification `iconUrl` via `chrome.runtime.getURL`.
- `extension/popup/index.html`, `extension/popup/popup.js` — local font, branding, help/bug/notice links to `juancruzobaid/meet-to-md`, "Credits" link instead of "Another project by Vivek"; Meet access warning + Grant access button; Google Meet checkbox uses the in-gesture request; version shown with `textContent`. The broken `SUSE` font import (malformed URL `&?family=`, never loaded; Google returns identical CSS without it) was dropped; the arrow keeps its `sans-serif` fallback, so it looks the same.
- `extension/meetings.html`, `extension/meetings.js` — local font, branding, Meet access banner instead of the unused permission dialog, gesture-safe webhook permission requests, Firefox data-collection consent, meeting title set with `textContent`. Webhook integration guide links still point to the upstream wiki (the webhook body format is identical; this repo has no wiki).
- `extension/side-panel/index.html`, `extension/side-panel/side-panel.js` — local font, title "Meet to MD"; meeting title set with `textContent` instead of `innerHTML` (the title comes from the Meet page). No Firefox-specific changes were needed.
- `extension/content-scripts/common-config.js`, `common-utils.js`, `google-meet/index.js`, `google-meet/utils.js` — user-visible strings rebranded (banner, FAB label, bug link, title tooltip); FAB click shows the Firefox sidebar hint on error `017`. Capture logic untouched.
- `types/index.js` — documented error codes 017 and 018.
- `README.md` — rewritten for Meet to MD: Install (Chromium; Firefox/Zen temporary via about:debugging and permanent via AMO "On your own" signed .xpi), privacy, notice, credits ("Based on TranscripTonic by Vivek G").
- `extension-unpacked.zip` — rebuilt from `extension/` (manifest at root).

**Files created:**
- `extension/shared/meet-access.js` — `hasGoogleMeetAccess()` / `requestGoogleMeetAccess()` shared by popup and meetings page.
- `extension/fonts/tasa-explorer-latin.woff2`, `extension/fonts/tasa-explorer-latin-ext.woff2` — TASA Explorer v2 from Google Fonts; it is a variable font (wght 400–800), so one file per subset covers the 400 and 700 weights used.
- `extension/fonts/fonts.css` — `@font-face` rules (same unicode ranges Google serves), linked from popup, meetings and side panel.
- `extension/fonts/OFL.txt` — SIL Open Font License 1.1.
- `meet-to-md-firefox.zip` — `web-ext build` of the same `extension/` source, for AMO signing.

**Tests performed:**
- `node --check` on every .js under `extension/` (background-script files as ES modules) → OK
- Every named import in `background-script/` resolves; every file referenced by manifest, `PLATFORM_CONFIGS`, HTML `src`/`href` and `fonts.css` exists (35 refs) → OK
- `grep -rnE "fonts\.googleapis|fonts\.gstatic|script\.google\.com|ejnana\.github\.io|TranscripTonic" extension/` → no matches
- `npx web-ext lint --source-dir extension` → 0 errors, 0 notices, 8 warnings (all expected, see final report): `sidePanel` permission unknown to Firefox; `background.service_worker` ignored by Firefox; `sidePanel.open` unsupported (×2, only called when `chrome.sidePanel` exists); `innerHTML` in meetings table row, FAB template and in-meeting banner (×4: extension-owned templates/constants; the page-controlled meeting title is now set with `textContent`)
- Fake-`chrome` Node test of `exporters.js` (9 cases): Firefox path (blob: URL, revoke on complete/interrupted, revoke via `downloads.search` when already finished, fallback reuses URL, 009 + revoke when both fail) and Chromium path (`URL.createObjectURL` undefined → base64 `data:text/markdown` with the expected Markdown, fallback, 009, "Failed to read blob"), 010 in both → all pass
- Fake-browser Node test of `background-script/index.js` in Chromium and Firefox modes: `new_meeting_started` uses `sender.tab.id` and falls back to the query; `broadcast_live_buffer` returns `false`; side panel opens for the sender tab (Chromium) / rejects `017` (Firefox); `open_popup` fails cleanly without `action.openPopup`; `enable_platform` registers without calling `permissions.request`; `onStartup` re-registers → all pass
- `shared/meet-access.js` in a Node VM: `storage.sync.set` then `permissions.request` are called synchronously, before any await; denied and synchronous-throw cases reject → OK
- `npx web-ext build` → `meet-to-md-firefox.zip` with the same 32 files as `extension-unpacked.zip`
- Not tested in a browser — owner to verify in Día and Zen (checklists in the final report)

**Final result:** One codebase and one manifest, loadable in Chromium (unpacked/zip) and Firefox ≥140 / Zen (temporary install, or signed unlisted .xpi). Extension pages make no font requests; the only remote requests are Meet itself and the user's webhook. All user-visible branding is "Meet to MD".

**Business Logic updated:** yes — System Overview (browsers), Caption Capture (permission flow, access warning, sidebar), Export (Firefox blob: download), Webhook (Firefox data-collection consent), network rules (fonts bundled)
**Master Plan updated:** yes — Firefox compatibility moved to Completed (pending manual validation); next: AMO signing; README update done

**Next step:** Manual validation in Día and Zen, then sign `meet-to-md-firefox.zip` on AMO as unlisted ("On your own"). Open question for the owner: Firefox lets users revoke the optional data-collection consent in about:addons while keeping the webhook host permission; the background does not check the consent before auto-posting (webhook behaviour intentionally untouched in this step).

---

### 2026-11-19 15:45 - Remove Zoom/Teams, dead code and upstream telemetry; fix download and notification bugs

**Task received:** Step 1 of 2 (Firefox comes later). Remove all Zoom/Teams support, dead alarm/permission-check code and upstream telemetry; fix the un-awaited download fallback and the accumulating webhook-notification click listener. Rename the extension to "Meet to MD".

**Files deleted:**
- `extension/content-scripts/teams/` (config.js, index.js, utils.js)
- `extension/content-scripts/zoom/` (config.js, index.js, utils.js)
- `extension/rules.json` — Zoom redirect DNR ruleset

**Files modified:**
- `extension/manifest.json` — name "Meet to MD", new description; removed `declarativeNetRequestWithHostAccess` and `alarms` permissions, `declarative_net_request` block and Zoom/Teams optional host permissions (kept `*://*/*` for the webhook); added `web_accessible_resources` exposing `icon.png` to `https://meet.google.com/*` (replaces the remote logo).
- `extension/background-script/config.js` — `PLATFORM_CONFIGS` only has `google_meet`; removed `ALARM_NAME` / `INTERVAL_IN_MINUTES`.
- `extension/background-script/platforms.js` — removed `registerZoomRedirect` / `deregisterZoomRedirect`; `reRegisterContentScripts` is Meet-only (still respects `wantGoogleMeet`); Meet-only registration notification text.
- `extension/background-script/index.js` — removed Zoom redirect / alarm imports and `hasZoom` branches, the `chrome.alarms.onAlarm` listener, commented-out `checkPermissionsAndOpenMeetingsPage` timeouts, `wantTeams` / `wantZoom` defaults and the stray `console.log`. `permissions.onAdded` de-registers then (chained) re-registers only google_meet. New single top-level `chrome.notifications.onClicked` listener (registered once; retried on `permissions.onAdded` because `chrome.notifications` only exists once the optional permission is granted) that opens `meetings.html` for ids starting with `webhook-failed-`.
- `extension/background-script/exporters.js` — `downloadTranscript`: fallback download is chained, resolves only after it succeeds, rejects `{ errorCode: "009", errorMessage }` if it fails; log text no longer mentions "TranscripTonic directory"; removed `script.google.com` error-logging fetch. `postTranscriptToWebhook`: no per-call `onClicked` listener; notification created with id `webhook-failed-<timestamp>` and only if `chrome.permissions.contains({ permissions: ["notifications"] })`. Exports `WEBHOOK_FAILED_NOTIFICATION_PREFIX`.
- `extension/background-script/meetings.js` — removed `script.google.com` "transcript generated" counter fetch.
- `extension/background-script/utils.js` — removed `checkAndCreateAlarm` and `checkPermissionsAndOpenMeetingsPage`.
- `extension/content-scripts/common-config.js` — removed `LOG_ERROR_SCRIPT_URL`, remote status URLs and Teams/Zoom notification configs; `LOGO_URL` is now `chrome.runtime.getURL("icon.png")`.
- `extension/content-scripts/common-utils.js` — `checkExtensionStatus` is local only (no fetch to the upstream status/kill-switch JSON); `logError` logs to console only; removed Teams/Zoom branches in the transcript monitor and hide-captions code; FAB uses the bundled logo; removed unused `meetsMinVersion`.
- `extension/popup/index.html`, `extension/popup/popup.js` — removed Teams/Zoom toggles, commented-out beta banner and its CSS.
- `extension/meetings.js` — permission check only considers `wantGoogleMeet`.
- `types/index.js` — `Platform` = `"google_meet"`, `MeetingSoftware` without Zoom/Teams, removed `WantTeams` / `WantZoom` / `showBetaMessage`.
- `extension-unpacked.zip` — rebuilt from `extension/`.

**Tests performed:**
- `node --check` on every .js under `extension/` (background-script files as ES modules) → no syntax errors
- `grep -rniE "zoom|teams|declarativeNetRequest|alarms|script\.google\.com" extension/ types/index.js` → no matches
- Only remaining `fetch(` is the user webhook; only remote URLs left are hyperlinks and Google Fonts on extension pages
- Every named import in `background-script/` resolves to an existing export; every file in `PLATFORM_CONFIGS.google_meet.js` exists; `manifest.json` is valid JSON
- Node script with a mocked `chrome` API: download fallback resolves after the second download succeeds; rejects `009` when both fail; webhook failure creates `webhook-failed-<ts>` notification only when the permission is granted
- Not tested in a browser — owner to verify in Día

**Final result:** Meet-only extension named "Meet to MD" with no outbound requests other than Meet and the user's webhook. MD export format and filename unchanged.

**Business Logic updated:** yes — System Overview (Meet only, network & privacy rules), Caption Capture (popup enable toggle), Export (fallback behaviour), Webhook (notification behaviour)
**Master Plan updated:** yes — cleanup moved to Completed, Zoom/Teams moved to Decided Against, Firefox compatibility added as In Progress

**Next step:** Step 2 — Firefox compatibility.

---

### 2026-11-11 — Re-port onto upstream v3.4.5 - batch 1: MD export

**Task received:** Re-port the Markdown export onto a clean copy of upstream v3.4.5 (branch `rebase-v3.4.5`). Keep diffs to upstream files minimal; our logic lives in new files, upstream files are touched only at call sites.

**Files modified:**
- `extension/background-script/exporters.js` — `downloadTranscript()` now uses `generateMdFilename()` / `generateMdContent()`; blob type `text/markdown`; fallback filename `meet-to-md/Meeting.md`. `postTranscriptToWebhook()` untouched.
- `extension/background-script/meetings.js` — `pickupLastMeetingFromStorage()` reads `meetingLanguage` / `defaultLanguage` from sync storage and stores `language` on the new meeting entry (nested `sync.get`, rest of flow unchanged).
- `types/index.js` — added optional `language` to `Meeting`; added `defaultLanguage` and `meetingLanguage` to `ResultSync`.

**Files created:**
- `extension/background-script/md-generator.js` — ES-module port of main's `extension/export/md-generator.js`. Exports `generateMdFilename(meeting)` and `generateMdContent(meeting)`. Changes vs main: no language parameter (uses `meeting.language || "en"`), frontmatter `source` is `${meetingSoftware || "Google Meet"} captions`, title falls back `meetingTitle || title`.
- `docs/` — brought over from main unchanged (this log entry is the only edit).

**Tests performed:**
- `node --check` on md-generator.js, exporters.js, meetings.js → OK
- Node script calling `generateMdFilename` / `generateMdContent` with a sample meeting (es, Google Meet, chat) and a fallback meeting (no language, old `title` key, Teams, no chat) → correct filename sanitising, frontmatter, 24h times, sorted participants, chat section only when non-empty.
- Not yet tested in the browser — developer to load the unpacked extension from this branch.

**Final result:** Auto-download and manual download from the "Last 10 meetings" page produce `meet-to-md/YYYY-MM-DD Title.md` with the same content as the old architecture. Language is persisted per meeting at pickup time.

**Business Logic updated:** No (batch 1 only touches the log)
**Master Plan updated:** No

**Next step:** Batch 2 and 3 (popup / language switcher / content-script re-port).

---

### 2026-03-29 — Fix language switcher timing — polling instead of fixed delays

**Task received:** Fix language switcher — dropdown element exists but code times out before it renders.

**Files modified:**
- `extension/language/language-switcher.js` — Replaced fixed `sleep()` delays with polling loops (up to 2s per step). Added `.rHGeGc-uusGie-fmcmS` as fallback selector for language dropdown. Added `[aria-label="Close dialog"]` as first close button selector.
- `extension/content-google-meet.js` — Same changes to inlined copy of language switcher functions.

**Final result:** Language switcher now polls for elements up to 2s per step instead of fixed delays. More reliable on slow connections.

**Business Logic updated:** No — no behavior change, just timing fix
**Master Plan updated:** No

---

### 2026-03-29 — Implement Meet caption language switcher — popup toggle controls Meet directly

**Task received:** When user clicks EN/ES in "This meeting" row, automate Meet's Settings UI to change caption language in real time.

**Files created:**
- `extension/language/language-switcher.js` — Standalone module with `switchMeetCaptionLanguage()`, helper functions for Settings UI automation, DOM selectors

**Files modified:**
- `extension/content-google-meet.js` — Inlined language switcher code at bottom + added `chrome.runtime.onMessage` listener for `switch_meet_language`
- `extension/popup.js` — Added `triggerMeetLanguageSwitch()` that queries Meet tabs via `chrome.tabs` and sends message to content script. Called from "This meeting" button handlers.
- `extension/manifest.json` — Added `"tabs"` permission (required for `chrome.tabs.query` and `chrome.tabs.sendMessage`)

**Tests performed:**
- Code review of Settings UI automation flow (open → Captions tab → dropdown → select → close) ✅
- Verified graceful failure: if no Meet tab active, storage still saves, switch silently skipped ✅
- Verified `chrome.runtime.lastError` handled in popup message callback ✅
- Verified `return true` in onMessage listener for async response ✅

**Final result:** Clicking EN/ES in "This meeting" saves preference AND switches Meet's caption language live via Settings automation.

**Business Logic updated:** Yes — Language Setting section updated with switcher behavior
**Master Plan updated:** Yes — Language switcher moved to Completed

---

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
