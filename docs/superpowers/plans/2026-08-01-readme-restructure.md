# README Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the README into a 5-minute bilingual landing page plus a new single-file English user guide (`docs/GUIDE.md`), add the repo's first two screenshots, and point the docs-currency rule at the guide.

**Architecture:** Pure docs change — no `src/` edits (verified: zero README references in plugin code). README.md is replaced with the verbatim block in Task 2; README.zh.md is a strict line-parallel translation; GUIDE.md absorbs every behavioral detail from the old README's Features bullets and "How it works" paragraphs.

**Tech Stack:** Markdown only. Screenshots via obsidian-cli + Electron BrowserWindow capture in the gitignored `dev/vault`.

**Spec:** `docs/superpowers/specs/2026-08-01-readme-restructure-design.md`

## Global Constraints

- NO COMMITS: working tree is the review state; one commit at cut. No Claude/AI attribution anywhere.
- `README.md` and `README.zh.md` must have **equal `wc -l`** and match structure line-by-line.
- GUIDE heading contract (exact text, exact order — README anchors depend on it):
  `# Ribbon and Status Bar Organizer — user guide` / `## Ribbon groups` / `## Hiding` / `## Quick menus` / `## Status bar` (containing `#### Ordering and hiding`, `#### Display modes`, `#### Rewrite rules`, `#### Learned samples`, `#### The preview strip`, `#### Mobile`) / `## Diagnostics`.
- Anchors the READMEs use: `#ribbon-groups`, `#hiding`, `#quick-menus`, `#status-bar`, `#rewrite-rules`, `#diagnostics`.
- Current-state voice: no "no more / anymore / moved to / the old X" phrasing anywhere in the new files.
- Every fact expands in exactly one place (the GUIDE); the README keeps one-sentence claims.
- No fact from old README lines 14–52 may be lost: every behavior, caveat, and example must be findable in the new README or GUIDE.
- UI terms stay in English in the Chinese README (ribbon, Quick menus, Status bar, Ungrouped, Full/Compact/Icon only); Chinese em-dash is `——`.
- Gates after all tasks: `npm run build`, `npm test`, `npm run lint` (zero-warning baseline) — all expected unchanged.

---

### Task 1: Create docs/GUIDE.md

**Files:**
- Create: `docs/GUIDE.md`
- Read (source material): `README.md` (the CURRENT file, before Task 2 replaces it)

**Interfaces:**
- Produces: the heading contract above — Tasks 2 and 3 link against those anchors verbatim.

- [ ] **Step 1: Read the current README.md in full.** Lines 14–20 (Features bullets) and 32–52 ("How it works" H3s) are the source facts. Every clause in them must survive into the GUIDE.

- [ ] **Step 2: Write `docs/GUIDE.md`** with exactly this skeleton (headings verbatim), filling each section per the mapping below. Target: each `####` runs 3–6 lines; `##` sections without `####`s may run longer but must be broken into paragraphs of one topic each. Open the file with the H1 and a two-sentence intro naming the three surfaces (ribbon, quick menus, status bar) and pointing back to `../README.md` for install and quick start.

```
# Ribbon and Status Bar Organizer — user guide
## Ribbon groups
## Hiding
## Quick menus
## Status bar
#### Ordering and hiding
#### Display modes
#### Rewrite rules
#### Learned samples
#### The preview strip
#### Mobile
## Diagnostics
```

Content mapping (source = current README):

- `## Ribbon groups` ← line 36 verbatim facts + tuck bullet (line 15): single column mirroring the ribbon's final order; drag icons between groups and drag groups to reorder; groups start collapsed — header shows a member count, or a visible/total pill when some members are hidden; filtering reveals matches inside collapsed groups; unassigned icons fall into the Ungrouped bucket so newly installed plugins land in a predictable spot; desktop and tablet ribbons are reordered in place, phones reorder the navbar ribbon menu (the ≡ button) as it opens, separators included; the tuck feature — mark any Ungrouped icon and it moves off the ribbon into one ⋯ button (icon customizable), click the button to reach the tucked icons.
- `## Hiding` ← line 40: hiding writes Obsidian's native hide and Commander's hide list together (when Commander is installed); showing clears both. Caveats, each its own sentence: Commander matches icons by title, so two same-titled icons share the hide; renaming a hidden icon makes it visible again and leaves a stale Commander entry behind; on phones, hidden icons also disappear from the navbar ribbon menu — including icons hidden only in Commander, which Obsidian's own menu would still show.
- `## Quick menus` ← line 48 + bullet line 17: each menu is one ribbon icon, icon and name editable, click the name to rename; entries carry editable labels and icons, including Iconize packs and the built-in `ribbon-organizer` icon, and can be grouped with separators; drag to reorder — drop on a row's top or bottom half to land before or after it; dropping an entry on a menu header sends it to that menu's end (its own header included); every row shows the owning plugin, exact command id in the hover tooltip; a command not installed on this device is greyed out and recovers automatically once its plugin is back. Caveat: renaming a menu changes its ribbon id, so it falls out of its ribbon group back into Ungrouped — re-drag to restore.
- `## Status bar` ← line 44 split across the six `####`s + bullet line 18:
  - intro line under `## Status bar` (before the first `####`): the tab lists every status bar item; changes apply live and on every device — items a device doesn't have keep their place; items are recognized by their plugin, and a plugin showing several items keeps them apart by position, which in rare cases can swap after an update of that plugin.
  - `#### Ordering and hiding`: drag to reorder (drop on a row's top or bottom half); hide with the eye; rows for items that exist but aren't visible right now (a Vim pending-key display, a hover-revealed button) say "Not shown right now"; self-positioning items show a lock and stay where their plugin puts them.
  - `#### Display modes`: each row's mode button cycles Full → Compact (capped width, full text on hover) → Icon only.
  - `#### Rewrite rules`: the wand opens a per-item panel with display-mode pills and the rule editor; `Successfully synced {time}` → `✓ {time}` turns Remotely Save's long message into a glance; `{name}` carries the changing part over; every rule can carry an icon and independent icon/text colors; anything that doesn't match a rule is shown exactly as its plugin wrote it.
  - `#### Learned samples`: the tab learns the statuses seen on this device — each shown next to what the current rules make of it, click one to auto-draft a rule; learned samples stay on this device (localStorage), they never sync.
  - `#### The preview strip`: a preview strip mirrors the real bar; hovering a row, the preview, or the bar itself highlights the same item in all three places.
  - `#### Mobile`: Obsidian hides the status bar on mobile by default; the "Show on phones and tablets" toggle floats it above the toolbar as a pill.
- `## Diagnostics` ← line 52: **Copy ribbon diagnostics** copies a JSON snapshot — platform, both hide layers per icon, and the outcome of the last phone-menu grouping pass — to the clipboard; attach it when reporting mobile issues.

- [ ] **Step 3: Verify voice and completeness.** Run `grep -inE "no more|anymore|moved to|previously|used to" docs/GUIDE.md` — expect zero hits. Re-read old lines 14–52 clause by clause and tick each off against the GUIDE.

- [ ] **Step 4: Verify heading contract.** `grep -n "^#" docs/GUIDE.md` must list exactly the skeleton headings in order, nothing else at `##`/`####` level.

### Task 2: Replace README.md + CLAUDE.md docs-currency bullet

**Files:**
- Modify: `README.md` (full replacement)
- Modify: `CLAUDE.md` (one sentence)

**Interfaces:**
- Consumes: GUIDE anchors from Task 1.
- Produces: the English structure Task 3 mirrors line-by-line.

- [ ] **Step 1: Replace the entire content of `README.md`** with this block, byte-exact:

````markdown
<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon and Status Bar Organizer logo"></p>

# Ribbon and Status Bar Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)
[![downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22ribbon-organizer%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=ribbon-organizer)
[![Static Badge](https://img.shields.io/badge/README-EN-blue)](./README.md)
[![Static Badge](https://img.shields.io/badge/README-中-red)](./README.zh.md)

An [Obsidian](https://obsidian.md) plugin that organizes the left ribbon into named groups, tames the status bar, and launches your commands from configurable ribbon menus.

![Ribbon tab](docs/assets/ribbon-tab.png)

## Features

- **Ribbon groups** — order the ribbon icons into named groups with a thin divider between them, on desktop, tablet and phone. ([details](docs/GUIDE.md#ribbon-groups))
- **Tuck icons away** — mark any Ungrouped icon and it moves off the ribbon into one ⋯ menu button. ([details](docs/GUIDE.md#ribbon-groups))
- **Hide icons everywhere** — one eye toggle writes both Obsidian's native hide and [Commander](https://github.com/jsmorabito/obsidian-commander)'s hide list, so the three UIs never disagree. ([caveats](docs/GUIDE.md#hiding))
- **Quick menus** — extra ribbon icons, each opening its own command list with editable labels and icons ([Iconize](https://github.com/FlorianWoelki/obsidian-iconize) packs included). ([details](docs/GUIDE.md#quick-menus))
- **Status bar order** — drag the status bar items into your own order and hide the ones you don't need, applied live on every device. ([details](docs/GUIDE.md#status-bar))
- **Shorten noisy items** — compact and icon-only display modes, plus rewrite rules like `Successfully synced {time}` → `✓ {time}` that can add an icon and colors. ([rules](docs/GUIDE.md#rewrite-rules))
- **Live preview** — a preview strip mirrors the real status bar, and hovering highlights the same item in the settings, the preview and the bar at once.
- **Status bar on mobile** — optionally show the status bar on phones and tablets as a floating pill.
- **Diagnostics** — a "Copy ribbon diagnostics" command copies a JSON snapshot for issue reports. ([details](docs/GUIDE.md#diagnostics))
- **Syncs like a note** — configuration lives in the plugin's `data.json`, so it follows whatever vault sync you use.

## Install

From Obsidian: **Settings → Community plugins → Browse**, search **Ribbon and Status Bar Organizer**, install and enable.

Beta builds: via [BRAT](https://github.com/TfTHacker/obsidian42-brat), add `xooooooooox/obsidian-ribbon-organizer`.

## Quick start

1. Open **Settings → Ribbon and Status Bar Organizer → Ribbon**: create a group and drag icons into it — dividers appear on the ribbon between adjacent non-empty groups.
2. Use the eye toggle on any row to hide or show that icon everywhere.
3. Switch to the **Status bar** tab: drag items into your order, or click a learned status text to draft a rewrite rule from it.
4. Switch to the **Quick menus** tab: create a menu and add commands — the menu appears as its own ribbon icon.

![Status bar tab](docs/assets/status-bar-tab.png)

## How it works

- **Grouping is visual-only** — a presentation layer over the existing buttons; Obsidian's own icon order and settings are never touched, and disabling the plugin restores the stock ribbon.
- **Every platform, two mechanisms** — desktop and tablet ribbons are reordered in place; on phones the plugin reorders the navbar ribbon menu (the ≡ button) as it opens.
- **The status bar keeps its own layer** — ordering, hiding and rewrites never modify what other plugins write, so an untouched config leaves a byte-for-byte native bar.

The full tour — groups, hiding, quick menus, the status bar tab, caveats — lives in the **[user guide](docs/GUIDE.md)**.

## Privacy

The plugin performs no network access and no telemetry. Configuration lives in the plugin's `data.json` and rides whatever vault sync you use; the status texts the plugin learns for rule drafting stay in each device's localStorage by design.

## Documentation

- **[User guide](docs/GUIDE.md)** — every behavior in one place: ribbon groups, hiding, quick menus, the status bar tab, diagnostics.
- **[Architecture](docs/ARCHITECTURE.md)** — code map and invariants, for contributors.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest
npm run build   # type-check + production bundle
```

Develop against a dedicated test vault (never a real one).

## License

[MIT](LICENSE)
````

- [ ] **Step 2: Verify.** `wc -l README.md` (record the number — Task 3 must match it). `grep -oE "GUIDE.md#[a-z-]+" README.md | sort -u` must yield exactly: `GUIDE.md#diagnostics`, `GUIDE.md#hiding`, `GUIDE.md#quick-menus`, `GUIDE.md#rewrite-rules`, `GUIDE.md#ribbon-groups`, `GUIDE.md#status-bar`.

- [ ] **Step 3: Edit `CLAUDE.md`.** In the "Documentation currency" bullet under `## Rules`, replace

  `— \`README.md\` and \`README.zh.md\` (keep the two in sync) and \`docs/ARCHITECTURE.md\` (code map / invariants, when structure changes).`

  with

  `— \`README.md\` and \`README.zh.md\` (keep the two in sync), \`docs/GUIDE.md\` (the user guide — behavioral detail lives there, not in the READMEs), and \`docs/ARCHITECTURE.md\` (code map / invariants, when structure changes).`

### Task 3: README.zh.md line-parallel translation

**Files:**
- Modify: `README.zh.md` (full replacement)
- Read: the NEW `README.md` (Task 2's output) and the OLD `README.zh.md` (for established translations — read it from git: `git show HEAD:README.zh.md`)

**Interfaces:**
- Consumes: Task 2's README.md as the line-by-line template.

- [ ] **Step 1: Translate line-parallel.** Same line count (`wc -l` equal), same structure per line: line N of README.zh.md corresponds to line N of README.md (headings ↔ headings, bullet ↔ bullet, image ↔ image, blank ↔ blank). Badge lines, image lines and the Development code block stay identical to the English file.
- [ ] **Step 2: Reuse established translations** from the old README.zh.md wherever the English sentence survived (e.g. the Quick start steps 1–2, the pitch's phrasing conventions). Conventions: UI terms stay English (ribbon, Quick menus, Status bar, Ungrouped, Full/Compact/Icon only, BRAT); `——` for em-dashes; headings 功能特性 / 安装 / 快速上手 / 工作原理 / 隐私 / 文档 / 开发 / 许可证; GUIDE links keep English URLs with short Chinese text ([详情] / [规则] / [注意事项] as fits each bullet).
- [ ] **Step 3: Verify.** `wc -l README.md README.zh.md` equal; `grep -oE "GUIDE.md#[a-z-]+" README.zh.md | sort -u` identical to the English list.

### Task 4: Screenshots (controller-inline — not dispatched to a subagent)

**Files:**
- Create: `docs/assets/ribbon-tab.png`, `docs/assets/status-bar-tab.png`

- [ ] **Step 1: Stage `dev/vault`.** `npm run smoke:install`; ensure enough community plugins are installed for a believable ribbon; configure 2–3 named groups (one collapsed with a visible/total pill), a status bar with several items and one `{name}` rewrite rule with an icon in effect.
- [ ] **Step 2: Capture.** Obsidian 1.13 opens Settings as a separate window: find it via `window.electron.remote.BrowserWindow.getAllWindows()`, drive its DOM with `webContents.executeJavaScript`, `show() + moveTop() + invalidate()` + ~1200 ms, then `webContents.capturePage()` → PNG. Window sized ≈1440×940.
- [ ] **Step 3: Review both PNGs** — correct tab shown, features visible per spec, no personal data (vault name, file names, usernames).
- [ ] **Step 4: Revert staging** — restore the dev vault plugin's `data.json` to its pre-staging state.

### Final gates (after all tasks)

- [ ] `npm run build` && `npm test` && `npm run lint` — all green, counts unchanged.
- [ ] Fact sweep: every clause of old README lines 14–52 findable in new README or GUIDE.
- [ ] `grep -inE "no more|anymore|moved to|previously|used to" README.md README.zh.md docs/GUIDE.md` → zero hits.
