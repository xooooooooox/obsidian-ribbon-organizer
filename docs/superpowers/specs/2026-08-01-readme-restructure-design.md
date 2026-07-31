# README restructure: landing page + user guide split — design

**Date:** 2026-08-01
**Status:** approved (brainstorm 2026-08-01; form: mirror obsidian-config-sync's README/GUIDE split)

## Problem

`README.md` (61 lines, `README.zh.md` line-parallel) is a landing page and a user
manual fused into one scroll, and it has drifted behind the product:

- **Wall-of-text sections.** The four "How it works" H3s are single monster
  paragraphs: line 36 (Ribbon groups), line 40 (Hiding), line 44 (Status bar,
  ~290 words covering display modes, the wand panel, the rewrite engine, learned
  samples, pinned items, the preview strip, and the mobile pill in one block),
  line 48 (Quick menus). The Features bullets (lines 14–20) each pack three or
  four clauses.
- **Zero screenshots.** Not even a hero image; a long-standing backlog item.
- **Stale Install section.** Line 24 offers only BRAT, but the plugin is live in
  the official community registry (id `ribbon-organizer`, name "Ribbon and
  Status Bar Organizer" — verified in `community-plugins.json`), so the store is
  the primary install path.
- **Stale downloads badge.** Line 6 counts GitHub release-asset downloads; the
  plugin now has an entry in `community-plugin-stats.json` (store downloads),
  the source config-sync's badge uses.
- **Pitch omits half the product.** Line 10 mentions only the ribbon; the plugin
  was renamed to "Ribbon and Status Bar Organizer" and the status bar is half
  the feature set.

`grep -rn README src/ manifest.json` → zero hits: no plugin copy points at
README sections, so this restructure touches **no TypeScript**.

## Shape

Mirror obsidian-config-sync's docs architecture exactly:

- `README.md` — a landing page that reads in five minutes. `README.zh.md` stays
  strictly line-parallel (equal `wc -l`).
- `docs/GUIDE.md` — **new**, English-only, single file. Every behavioral detail
  lives here; each fact expands in exactly one place (the GUIDE), while the
  README keeps one-sentence claims linking into it.
- `docs/assets/` — **new**, two screenshots.
- `CLAUDE.md` — the documentation-currency rule adds `docs/GUIDE.md`.

## README.md — target structure

Section order mirrors config-sync's README:

1. **Header** — logo, title, badges. The release and EN/中 badges stay as-is.
   The downloads badge switches to the store source:
   `https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22ribbon-organizer%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json`
   linking to `https://obsidian.md/plugins?id=ribbon-organizer`.
2. **Pitch** — one sentence covering all three surfaces: organizes the left
   ribbon into groups, tames the status bar, and launches commands from
   configurable ribbon menus.
3. **Hero image** — `docs/assets/ribbon-tab.png`.
4. **Features** — ~10 one-sentence bullets, one fact each, five or more linking
   GUIDE anchors (`[details](docs/GUIDE.md#…)` style, matching config-sync).
   Coverage (each bullet's detail clauses move to the GUIDE):
   ribbon groups with dividers on all three platforms; tuck Ungrouped icons
   into a ⋯ menu; dual-layer hide (native + Commander) that never disagrees;
   quick menus with editable labels/icons (Iconize supported); status bar
   drag-reorder and hide; display modes plus rewrite rules with icons and
   per-part colors; live preview strip; mobile floating-pill status bar;
   diagnostics command; config rides your vault sync via `data.json`.
5. **Install** — store first: "From Obsidian: **Settings → Community plugins →
   Browse**, search **Ribbon and Status Bar Organizer**, install and enable."
   Then "Beta builds: via BRAT, add `xooooooooox/obsidian-ribbon-organizer`."
6. **Quick start** — four steps: (1) create a ribbon group and drag icons in;
   (2) hide an icon with the eye toggle; (3) Status bar tab: drag to reorder,
   click a learned status to draft a rewrite rule; (4) Quick menus tab: create
   a menu and add commands. `docs/assets/status-bar-tab.png` sits in this
   section.
7. **How it works** — three short bullets, then the pointer sentence:
   - Grouping is visual-only — flex `order` plus injected dividers; Obsidian's
     own item order and persistence are never touched, and disabling the plugin
     restores the stock ribbon.
   - Desktop and tablet ribbons are reordered in place; on phones the plugin
     reorders the navbar ribbon menu (the ≡ button) as it opens.
   - The status bar keeps its own layer: ordering, hiding and rewrites never
     modify what other plugins write, so an untouched config leaves a
     byte-for-byte native bar.
   - "The full tour — groups, hiding, quick menus, the status bar tab,
     walkthrough caveats — lives in the **[user guide](docs/GUIDE.md)**."
8. **Privacy** — three lines: the plugin performs no network access and no
   telemetry; configuration lives in the plugin's `data.json` and rides
   whatever vault sync you use; the status texts the plugin learns stay in each
   device's localStorage by design.
9. **Documentation** — user guide (GUIDE.md) + architecture (ARCHITECTURE.md,
   for contributors).
10. **Development** — fenced block (`npm install` / `npm run dev` / `npm test`
    / `npm run build`), plus the dev-vault warning line ("Develop against a
    dedicated test vault (never a real one).").
11. **License** — `[MIT](LICENSE)`.

**README.zh.md**: strict line parallelism (equal `wc -l`, same structure line
by line). Reuse the existing file's conventions and existing translations
verbatim where the English sentence survives: UI terms stay English (ribbon,
Quick menus, Status bar, Ungrouped), `——` for em-dash, headings 功能特性 / 安装 /
快速上手 / 工作原理 / 隐私 / 文档 / 开发 / 许可证; GUIDE link text short
brackets like [详情] / [导览].

## docs/GUIDE.md — heading contract

README anchors depend on these exact headings, in this order:

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

Anchor slugs used by the READMEs: `#ribbon-groups`, `#hiding`, `#quick-menus`,
`#status-bar`, `#rewrite-rules`, `#diagnostics`.

**Content sources** (every fact preserved; no summarizing away of rules or
caveats):

- `## Ribbon groups` ← old README line 36 plus the tuck bullet (line 15): the
  single-column mirror of final ribbon order, drag icons between groups and
  groups to reorder, collapsed headers with member count / visible-total pill,
  filtering reveals matches inside collapsed groups, the Ungrouped bucket as
  the predictable landing spot, in-place reorder on desktop/tablet vs. the
  phone navbar ribbon menu pass (separators included), and the ⋯ tuck menu
  (mark any Ungrouped icon, customizable button icon).
- `## Hiding` ← line 40: writes native + Commander hide together, showing
  clears both; caveats — Commander matches by title so same-titled icons share
  the hide, renaming a hidden icon re-shows it and strands a stale Commander
  entry; on phones hidden icons also leave the navbar ribbon menu, including
  Commander-only hides Obsidian's own menu would still show.
- `## Quick menus` ← line 48 plus bullet line 17: one ribbon icon per menu,
  click the name to rename, entries with editable labels and icons (Iconize
  packs and the built-in `ribbon-organizer` icon), separators, drag semantics
  (top/bottom half; drop on a menu header sends to that menu's end, own header
  included), plugin name per row with command id in the tooltip, greyed-out
  missing commands that recover on reinstall; caveat — renaming a menu changes
  its ribbon id and drops it back to Ungrouped.
- `## Status bar` ← line 44 (the ~290-word paragraph) split across the six
  `####` subsections, each 3–6 lines, plus bullet line 18's rewrite-rule
  example: drag with top/bottom-half drop, live application on every device
  with absent items keeping their place, Full → Compact → Icon-only cycling,
  the wand panel (mode pills, learned statuses each previewed against current
  rules, click to auto-draft), the rule editor with `{name}` capture, per-rule
  icon and independent icon/text colors, unmatched text shown verbatim,
  learned samples in device localStorage (never synced), "Not shown right now"
  rows, pinned self-positioned items with the lock, the three-way hover
  highlight (settings row / preview strip / real bar), the mobile
  "Show on phones and tablets" floating pill, and the identity caveat (items
  recognized by plugin, disambiguated by position, rare swap after that
  plugin updates).
- `## Diagnostics` ← line 52: what the JSON snapshot contains (platform, both
  hide layers per icon, last phone-menu grouping pass) and when to attach it.

**Voice**: current-state reference throughout — no "no more X" / "Y moved to
Z" phrasing (the current README is already clean; keep it that way).

## Screenshots

Two PNGs, captured in `dev/vault` (gitignored), no personal data:

- `docs/assets/ribbon-tab.png` (hero) — settings → Ribbon tab showing at least
  two named groups with real plugin icons, one group collapsed showing the
  visible/total pill, the Ungrouped bucket, and the filter field.
- `docs/assets/status-bar-tab.png` — Status bar tab showing several rows with
  mode buttons, at least one rewrite rule in effect (e.g. a `{name}` rule with
  an icon), and the preview strip.

Technique (Obsidian 1.13 opens Settings as a separate window):
`window.electron.remote.BrowserWindow.getAllWindows()` to find the Settings
window, drive its DOM via `webContents.executeJavaScript`, capture via
`webContents.capturePage()`; guard against stale frames with
`show() + moveTop() + invalidate()` + delay. Stage the dev vault first: enough
community plugins for a believable ribbon, groups configured, status bar items
with one rule. Any staging config added to the dev vault is reverted after
capture.

## CLAUDE.md

The "Documentation currency" rule in `## Rules` adds `docs/GUIDE.md` alongside
the READMEs: behavioral detail lives in the guide, not in the READMEs.

## Out of scope

- No changes to `docs/ARCHITECTURE.md` or `docs/DESIGN.md` — contributor
  docs, untouched.
- No Chinese guide (English-only, per the config-sync decision).
- No plugin copy changes (grep verified zero README references in `src/`).
- No store-description update (that lives in `obsidianmd/obsidian-releases`;
  separate backlog line).

## Gates

- `npm run build`, `npm test`, `npm run lint` (zero-warning baseline) all
  green — expected unchanged, since no `src/` edits.
- `wc -l README.md README.zh.md` equal.
- Every GUIDE anchor used by the READMEs resolves against the heading
  contract.
- Old README fact-by-fact sweep: every behavior, caveat, and example sentence
  from lines 14–52 is findable in the new README or the GUIDE.

## Execution mode

NO-COMMITS: the working tree is the review state; one commit at cut. This spec
and the plan enter that commit (repo convention).
