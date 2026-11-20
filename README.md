# Meet to MD
Google Meet transcripts as Markdown. Private and open source.

Meet to MD captures Google Meet's live captions and, when the meeting ends, saves them as a Markdown file with YAML frontmatter, ready for Obsidian or any notes app. The same code runs in **Chromium browsers (Chrome, Día)** and **Firefox-based browsers (Firefox, Zen)**.

- Saves `Downloads/meet-to-md/YYYY-MM-DD Meeting title.md` after every meeting
- Live transcript in the browser side panel (Chromium) or sidebar (Firefox)
- Last 10 meetings kept locally for re-download
- Optional webhook to send transcripts to your own tools (n8n, Google Docs, ...)
- No accounts, no telemetry, no AI

<br />

# Install

## Chromium: Chrome, Día
1. Download [`extension-unpacked.zip`](extension-unpacked.zip) and unzip it into a folder you will keep (or clone this repo and use its `extension/` folder).
2. Open the extensions page: `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Pin Meet to MD, open its popup and check that **Google Meet** is ticked.

To update, replace the folder contents and click the reload icon on the extension card.

## Firefox, Zen
Requires Firefox 140 or later (Zen is built on current Firefox).

**Temporary install (for testing).** Removed when the browser restarts.
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `extension/manifest.json` (or [`meet-to-md-firefox.zip`](meet-to-md-firefox.zip)).

**Permanent install (signed .xpi).** Release builds of Firefox only install signed add-ons. Sign it yourself as an unlisted ("On your own") add-on; it is not published on the store.
1. Sign in at [addons.mozilla.org Developer Hub](https://addons.mozilla.org/developers/) and choose **Submit a New Add-on**.
2. Choose **On your own** and upload [`meet-to-md-firefox.zip`](meet-to-md-firefox.zip).
3. When automatic signing finishes, download the signed `.xpi`.
4. In Firefox/Zen, open `about:addons`, click the gear icon, then **Install Add-on From File…** and pick the `.xpi`.

After installing:
- Open the popup. If it says **Google Meet access is not granted**, click **Grant access**. Firefox lets you revoke site access at any time, so the popup and the meetings page show this warning whenever access is missing.
- The live transcript sidebar opens from the browser's sidebar menu (Firefox does not let an extension open it from a button inside the Meet page).
- When you set up a webhook, Firefox also asks you to allow sharing meeting content, because transcripts leave the device.

<br />

# How to use
**In both modes, the transcript is downloaded as a Markdown file at the end of each meeting.**

- **Auto mode:** records transcripts for all meetings automatically
- **Manual mode:** turn on captions (CC icon) in Google Meet when you want a transcript

Example output:

```markdown
---
date: 2026-11-20
meeting_id: ""
language: en
participants:
  - Ana
  - Juan Cruz
duration_minutes: 45
source: Google Meet captions
---

# Weekly Sync

## Transcript

**Juan Cruz** (10:02): Good morning...
```

<br />

# Webhooks
In the popup, click **webhooks** to open the settings section of the meetings page. Paste your webhook URL there. Choose the simple body (pre-formatted text) or the advanced body (raw arrays). The page shows both formats. Transcripts are only sent to the URL you configure.

<br />

# FAQ
**1. Can I change the language of the transcript?**
Yes. Meet to MD records whatever Google Meet captions show. Change the captions language in Meet's settings.

**2. I did not get a transcript at the end of the meeting.**
This can happen after a Google Meet update or after a crash or network drop. Open the popup, go to **Last 10 meetings** and click **Recover last meeting** before starting another meeting. Meet to MD also tries to recover a missed transcript automatically when the next meeting starts.

Found a bug? [Open an issue](https://github.com/juancruzobaid/meet-to-md/issues).

<br />

# Privacy policy
Meet to MD does not collect any information. It has no telemetry, analytics or remote error logging. Everything is processed and stored in your browser. Data only leaves your device if you configure a webhook, and then only to the URL you chose.

<br />

# Notice
The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.

<br />

# Credits
Based on TranscripTonic by Vivek G (https://github.com/vivek-nexus/transcriptonic), released under the MIT License.

Bundled font: [TASA Explorer](https://github.com/localremotetw/TASA-Typeface-Collection), SIL Open Font License 1.1 (see `extension/fonts/OFL.txt`).

# License
MIT, see [LICENSE](LICENSE).
