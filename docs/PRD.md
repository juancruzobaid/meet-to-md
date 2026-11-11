# Meet to MD — Product Requirements Document

**Version:** 0.3  
**Status:** Draft  
**Author:** Juan Cruz  
**Repo:** github.com/juancruzobaid/meet-to-md  
**Upstream:** github.com/vivek-nexus/transcriptonic (MIT)

---

## 1. Purpose

Public fork of TranscripTonic that replaces its plain TXT export with structured Markdown files ready for Obsidian, adds a configurable save folder, and adds a visible language toggle in the popup.

The caption scraping engine (the part that breaks when Google updates Meet) is inherited from TranscripTonic and kept in sync via upstream merges. All custom logic lives in the export layer and popup UI — fully decoupled from the DOM scraping.

**Out of scope:** audio transcription, AI summarization, Zoom/Teams support.

---

## 2. Problem

TranscripTonic solves the hard problem (reliable caption scraping, active maintenance, DOM compatibility) but outputs plain TXT with no structure, no configurable destination, and no language switcher in the UI.

Obsidian users need:
- Markdown with YAML frontmatter (date, participants, language)
- A save folder they control (their Obsidian vault)
- A one-click language toggle visible during the meeting — not buried in Meet's settings menu

---

## 3. What we inherit from TranscripTonic (do not modify)

| Component | File(s) | Why we don't touch it |
|---|---|---|
| Caption DOM scraping | `meet-content.js` | This is the fragile part — TranscripTonic maintainer handles Google DOM changes |
| Speaker detection | `meet-content.js` | Same |
| Transcript recovery logic | `background.js` | Reliable, battle-tested |
| Auto/manual mode | `background.js` + popup | Works well, keep as-is |
| Webhook integration | settings pages | Useful, keep for power users |

---

## 4. What we change (our additions only)

| Component | Change |
|---|---|
| Export function | Replace TXT download with MD generator + File System Access API |
| YAML frontmatter | Add date, meeting_id, language, participants, duration |
| Popup UI | Add prominent EN/ES language toggle |
| Language switcher | Content script triggers Meet's caption language change on toggle click |
| Settings page | Add: destination folder picker, filename pattern, language list |

---

## 5. Output file format

```markdown
---
date: 2025-03-29
meeting_id: abc-defg-hij
language: en
participants:
  - Juan Cruz
  - Donna D'Hoostelaere
duration_minutes: 45
source: Google Meet captions
---

# Meeting 2025-03-29

## Transcript

**Juan Cruz** (10:02): Good morning, let's start with...

**Donna** (10:03): Yes, I reviewed the numbers and...

**Juan Cruz** (10:05): Perfect, so we agreed that...
```

---

## 6. Features — v1

| Feature | Description | Origin |
|---|---|---|
| Caption capture | DOM scraping while CC is active | ✅ Inherited |
| Speaker labels | Participant name from captions DOM | ✅ Inherited |
| Timestamps | Time marker per caption block | ✅ Inherited |
| Auto/manual mode | Record all meetings or on demand | ✅ Inherited |
| Transcript recovery | Recover missed transcripts | ✅ Inherited |
| Webhook integration | Post transcript to external tools | ✅ Inherited |
| **MD export** | YAML frontmatter + structured transcript | 🆕 Ours |
| **Configurable folder** | File System Access API — save to Obsidian vault | 🆕 Ours |
| **Language toggle** | Prominent EN/ES button in popup | 🆕 Ours |
| **Language switcher** | Triggers Meet caption language change via content script | 🆕 Ours |
| **Language in frontmatter** | Selected language recorded in YAML | 🆕 Ours |

---

## 7. Out of scope — v1

- AI summarization (separate pipeline, future project)
- Zoom / Teams (TranscripTonic beta — not relevant for our use case)
- Cloud storage
- Auto language detection within a session
- Mixed-language capture

---

## 8. Upstream sync strategy

```
upstream (TranscripTonic)
        ↓  git merge upstream/main
   our fork
        ↓  our changes: export layer + popup only
   meet-to-md
```

- Our custom code lives in clearly marked files/functions
- `meet-content.js` is never modified — upstream changes merge cleanly
- When TranscripTonic ships a fix for a Google DOM change: `git fetch upstream && git merge upstream/main`

---

## 9. Repo structure

```
meet-to-md/  (fork of transcriptonic)
├── extension/
│   ├── meet-content.js       # UPSTREAM — do not modify
│   ├── background.js         # UPSTREAM — do not modify
│   ├── popup/
│   │   ├── popup.html        # Modified: add language toggle
│   │   └── popup.js          # Modified: language toggle logic
│   ├── settings/             # Modified: add folder + language settings
│   ├── export/               # NEW — our MD generator
│   │   └── md-generator.js
│   └── language/             # NEW — Meet language switcher
│       └── language-switcher.js
├── docs/
│   ├── PRD.md                # This document
│   ├── UPSTREAM.md           # How to sync with TranscripTonic
│   └── MEET-DOM.md           # Language settings selectors (our research)
├── README.md
├── ROADMAP.md
└── LICENSE                   # MIT (inherited)
```

---

## 10. Development phases

### Phase 0 — Fork setup (1 day)
- [ ] Fork transcriptonic into `juancruzobaid/meet-to-md` on GitHub
- [ ] Add upstream remote: `git remote add upstream https://github.com/vivek-nexus/transcriptonic`
- [ ] Load fork locally in Chrome, verify it works as-is
- [ ] Add `docs/` folder with PRD and UPSTREAM.md

### Phase 1 — MD export (2–3 days)
- [ ] Locate the function in TranscripTonic that generates and downloads the TXT
- [ ] Create `export/md-generator.js` with YAML frontmatter + transcript body
- [ ] Replace TXT download call with MD generator
- [ ] Test: verify MD output is valid and Obsidian-readable

### Phase 2 — Configurable folder (2 days)
- [ ] Implement File System Access API for folder selection
- [ ] Add folder picker to settings page
- [ ] Fallback to `chrome.downloads` if File System Access API is unavailable
- [ ] Persist selected folder across sessions

### Phase 3 — Language toggle (2–3 days)
- [ ] Map Meet's caption language settings DOM (`MEET-DOM.md`)
- [ ] Create `language/language-switcher.js`
- [ ] Add EN/ES toggle to popup (prominent, always visible)
- [ ] Wire toggle → content script → Meet language change
- [ ] Record selected language in MD frontmatter

### Phase 4 — Release prep (1 day)
- [ ] Update README: fork origin, what's different, installation, usage
- [ ] Publish ROADMAP.md
- [ ] Tag v1.0.0

---

## 11. Known risks

| Risk | Who handles it | Mitigation |
|---|---|---|
| Google changes Meet captions DOM | TranscripTonic upstream | Merge upstream fix — our code unaffected |
| Google changes Meet language settings DOM | Us | Isolated in `language-switcher.js` — easy to patch |
| File System Access API unavailable | Us | `chrome.downloads` fallback already implemented |
| TranscripTonic changes internal data structure | Us | Adapter in `md-generator.js` — one function to update |
| TranscripTonic abandoned | Us | Fork becomes standalone — we own the content script |

---

## 12. License

MIT — inherited from TranscripTonic. Fork attribution maintained in README.

---

## 13. Initial GitHub Issues

1. `[SETUP]` Fork transcriptonic, add upstream remote, verify locally
2. `[SETUP]` Add docs/ folder with PRD and UPSTREAM.md
3. `[RESEARCH]` Locate TXT export function in TranscripTonic source
4. `[RESEARCH]` Map Meet caption language settings DOM selectors
5. `[FEAT]` MD generator with YAML frontmatter
6. `[FEAT]` Replace TXT export with MD generator
7. `[FEAT]` File System Access API — folder picker in settings
8. `[FEAT]` Fallback to chrome.downloads when File System Access unavailable
9. `[FEAT]` Language switcher content script
10. `[FEAT]` EN/ES toggle in popup UI
11. `[FEAT]` Record selected language in MD frontmatter
12. `[DOCS]` Update README — fork origin, differences, install, usage
