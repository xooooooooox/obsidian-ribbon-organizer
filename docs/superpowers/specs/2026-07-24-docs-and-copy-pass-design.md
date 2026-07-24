# Docs & copy pass — design

Date: 2026-07-24 · Status: approved · Baseline: 0.7.0 (`146c208`)

## Goal

Bring Ribbon Organizer's documentation up to the convention established by obsidian-config-sync's docs iteration, and unify the settings-panel copy from a user/product perspective. No behavior changes — every code edit in scope is a user-visible string.

## Decisions (user-approved)

1. **Feature rename (user-facing only): "Quick commands" → "Quick menus".** The tab, README/zh, ARCHITECTURE feature naming, and any user-visible string say "Quick menus". Code identifiers stay: `core/quickCommands.ts`, `quickMenuEntries`, settings keys, CSS classes (`ribbon-organizer-qc-*`), test files — none are renamed.
2. **README restructure to the config-sync shape** (Features → Install → Quick start → How it works → Development → License); EN and zh stay structurally 1:1.
3. **Downloads badge: GitHub release total** (`https://img.shields.io/github/downloads/xooooooooox/obsidian-ribbon-organizer/total?label=downloads`), added to both READMEs' badge rows. Swap to the community-store stats badge (config-sync style) only after store acceptance — the store badge renders "invalid" for an unlisted plugin.
4. **All minor copy findings fixed** (including the two optional ones: Notice prefix, count format).
5. **No screenshots this round** — deferred to the store-submission pass. **DESIGN.md stays deferred.** AGENTS.md untouched.

## A. README.md (EN)

Reorganize only — every statement must trace to the current README, `docs/ARCHITECTURE.md`, or the 0.7.0 release notes. No new claims.

- **Header**: logo, title, badge row (release + new downloads badge + EN/中 badges), one-line pitch. Pitch updated for the rename: "…organizes the left ribbon and launches your commands from configurable ribbon menus."
- **`## Features`** — five short bullets (one or two sentences each, what-it-does only):
  - Ribbon groups: named groups with divider lines; desktop, tablet drawer, and phone ≡ menu all covered.
  - Hide icons: per-row eye toggle writing both Obsidian's native hide and Commander's hide list.
  - Quick menus: any number of ribbon-icon menus with editable icon/name; per-entry labels and icons (Iconize packs and the built-in `ribbon-organizer` icon included); separators.
  - Diagnostics: "Copy ribbon diagnostics" command → JSON snapshot to clipboard.
  - Config rides `data.json`, so it follows your existing vault sync.
- **`## Install`** — current BRAT paragraph, unchanged.
- **`## Quick start`** — three steps: ① Settings → Ribbon Organizer → Ribbon tab: create a group, drag icons in; ② eye toggle to hide/show; ③ Quick menus tab: create a menu, add commands — its icon appears on the ribbon.
- **`## How it works`** — the detail and caveats currently packed into the four long bullets, as one short subsection per feature:
  - *Ribbon groups*: divider between adjacent non-empty groups; collapsed headers with count / visible-total pill; ungrouped bucket as the predictable landing spot; the two mechanisms (desktop/tablet flex order vs phone menu rebuild).
  - *Hiding*: dual-layer write and why the three UIs never disagree; caveats — Commander matches by title (same-titled icons share the hide; renaming a hidden icon un-hides it and leaves a stale Commander entry); on phones Commander-only-hidden icons also vanish from the ≡ menu.
  - *Quick menus*: drag semantics (drop on a row inserts before it; drop on a header appends to that menu); always-visible command id; greyed-out not-on-this-device rows that recover automatically; caveat — renaming a menu changes its ribbon id and drops it back to Ungrouped.
  - *Diagnostics*: what the JSON contains, when to attach it to an issue.
- **`## Development`** — new, short: build/test/lint/smoke commands in one line each, pointer to `docs/ARCHITECTURE.md`.
- **`## License`** — unchanged.

## B. README.zh.md

1:1 structural mirror of the new EN, reusing the existing zh phrasing/terminology (分隔线、置灰、组头 etc.). Header keeps the zh badge convention (release + downloads badges, then `[English](README.md) · **中文**`). Feature name in zh copy: "Quick menus"(保留英文名,与设置面板一致).

## C. CLAUDE.md fixes

- **Stale rule (real bug)**: "Grouping is desktop-only (`Platform.isDesktop`); quick commands must keep working on mobile" → grouping runs on every platform through two mechanisms — desktop/tablet via flex order (`applyGrouping`), phones via the observed navbar menu (`observeMenus`/`groupRibbonMenu`); quick menus keep working on mobile (`isDesktopOnly: false`). Matches ARCHITECTURE invariant 8.
- **Spec pointers**: line 3 currently names only the 2026-07-23 grouping spec; add `docs/superpowers/specs/2026-07-24-mobile-menu-and-settings-polish-design.md` as required reading before changing `observeMenus`/`groupRibbonMenu`.
- Provenance sentence updates to the new name: "The Quick menus feature (formerly Quick commands) was extracted from obsidian-config-sync…".

## D. docs/ARCHITECTURE.md

Content is already current with 0.7.0; this pass only (a) renames the user-facing feature to "Quick menus" where the doc speaks product language (feature list, tab names), keeping all code identifiers as-is, and (b) gets a drift check — each documented claim cross-checked against `src/` and the release notes. Beyond the rename, expected diff is zero; fix anything the check surfaces.

## E. Settings-panel copy fixes (`src/`)

String-level only; no logic changes.

| # | File | Current | New |
|---|------|---------|-----|
| 1a | `ui/SettingTab.ts:11` | tab label `"Quick commands"` | `"Quick menus"` |
| 1b | `ui/SettingTab.ts:34` | desc `"Ribbon and quick commands."` | `"Group and hide ribbon icons; launch commands from ribbon menus."` |
| 2 | `ui/GroupsSection.ts:202` | ternary special-casing `"Move to ungrouped"` | drop the ternary — always `` `Move to ${target.name}` `` (renders "Move to Ungrouped") |
| 3 | `ui/GroupsSection.ts:134` | `"Delete group (members fall to ungrouped)"` | `"Delete group (members fall to Ungrouped)"` |
| 4 | `ui/QuickMenusSection.ts:180` | trash tooltip `"Remove"` | `"Remove command"` / `"Remove separator"` per entry kind |
| 5 | `main.ts:317` | `"Ribbon diagnostics copied to clipboard."` | `"Ribbon Organizer: diagnostics copied to clipboard."` — all five Notices share the prefix |
| 6 | `main.ts:372` | `"No commands configured — add them in the plugin settings"` | `"No commands configured — add them in Ribbon Organizer settings"` |
| 7 | `ui/QuickMenusSection.ts:84` | count `` `· ${commandCount}` `` | `` `${commandCount}` `` — same format as group headers |

Lint contingency: if `obsidianmd/ui/sentence-case` flags the capital-U "Ungrouped" in #3, add `'Ungrouped'` to the rule's `brands` list in `eslint.config.mts` with a rationale comment (it is the sentinel group's displayed name; the brands option replaces the default list, so 'Ribbon Organizer' and 'Obsidian' stay listed).

## F. GitHub repository details (About)

Currently empty on RO; config-sync's convention is a one-line description sourced from the README pitch plus ~5 topics, no homepage URL.

- **Description**: `Organize the Obsidian left ribbon into named groups with dividers, hide icons, and launch commands from quick ribbon menus — desktop, tablet, and phone.`
- **Topics**: `obsidian`, `obsidian-plugin`, `ribbon`, `toolbar`, `customization`
- Applied at implementation time via `gh repo edit` (not a repo file); the social-preview PNG stays a separate pending item (GitHub only accepts PNG uploads there, done manually).

## Out of scope

Screenshots, DESIGN.md, AGENTS.md, store downloads badge, the store submission itself, any renaming of code identifiers or `data.json` keys.

## Verification

- Gates: `npm test`, `npm run build`, `npm run lint` (zero warnings).
- Smoke: open the settings panel in `dev/vault` via obsidian-cli and read back the new strings (tab label, tooltips, desc); trigger the diagnostics Notice.
- Docs: per the docs-currency rule, cross-check every documented feature statement against `src/` and the 0.7.0 release notes; EN/zh section-by-section 1:1 check.
- About: `gh repo view --json description,repositoryTopics` reads back the values from section F.
- Changes stay uncommitted until the user asks for a commit/cut.
