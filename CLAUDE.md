# CLAUDE.md

Obsidian plugin: the ribbon & status bar housekeeper — orders the left-ribbon icons into named groups with divider lines, launches commands from configurable ribbon menus, and reorders/hides/restyles status bar items (modes, {name} rewrite rules with icons and colors, mobile pill). Grouping spec: `docs/superpowers/specs/2026-07-23-ribbon-grouping-design.md` (read it before changing `applyGrouping` or the settings panel); phone-menu spec: `docs/superpowers/specs/2026-07-24-mobile-menu-and-settings-polish-design.md` (read it before changing `observeMenus`/`groupRibbonMenu`). Status-bar specs: `docs/superpowers/specs/2026-07-28-statusbar-*.md` and `2026-07-29-*.md` (read the matching one before changing `applyStatusBarOrder`, the rewrite engine, or `StatusBarSection`). The Quick menus feature (formerly Quick commands) was extracted from [obsidian-config-sync](https://github.com/xooooooooox/obsidian-config-sync); the extraction spec lives in that repo.

## Doc map

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the live code map, invariants and extension points. Read it before structural changes.
- [`docs/DESIGN.md`](docs/DESIGN.md) — the visual and copy language. Read it before any UI work; update it in the same branch as any UI change.
- [`docs/GUIDE.md`](docs/GUIDE.md) — the user guide (behavioral detail lives there, not in the READMEs). `README.md`/`README.zh.md` are the short pitch, kept in sync with each other.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each release, newest first. A release's GitHub notes are its entry here; nothing else records version history. From 0.18.0 on, entries follow config-sync's format — flat bullets starting with Added/Changed/Fixed, no headline, no trailing periods; the pre-0.18.0 backfill keeps the old headline style its releases shipped with.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — historical design/working documents, ordered by date. Useful for rationale archaeology; never a statement of the current system — the live docs above are.

## Commands

- `npm run dev` — esbuild watch → `main.js`
- `npm run build` — `tsc -noEmit` + production bundle (run before finishing any change)
- `npm test` — vitest; covers the pure `src/core/` layer only
- `npm run lint` — baseline is **zero warnings**
- `npm run smoke:install` — build and install into `./dev/vault` (gitignored) under plugin id `ribbon-organizer`
- Releasing: `npm version <x.y.z>` → `git push --follow-tags` → CI drafts the release → hand-write the release notes and add them as the release's `CHANGELOG.md` entry → publish the draft (BRAT needs a published release). Tags carry no `v` prefix. ⚠️ Force-pushing a tag re-triggers the release workflow on this repo — delete the duplicate draft it spawns.

## Architecture

Full code map, invariants, and extension points: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- `src/core/` — pure functions with no `obsidian` import; the only tested layer.
- `src/ui/` — the three-tab settings panel (Ribbon / Quick menus / Status bar) and fuzzy pickers; thin, no logic worth unit-testing.
- `src/main.ts` — plugin shell; owns the private API (`app.workspace.leftRibbon`, `app.commands`, `app.statusBar`, `app.mobileNavbar`, Commander via `app.plugins`). `ribbonInternals()` and `statusBarContainer()` runtime-validate the shapes — on mismatch the feature disables itself for the session (console.error + one Notice) instead of guessing.

## Key constraints

- Ribbon grouping is **visual-only**: flex `order` on the existing buttons plus injected divider divs. Never reorder Obsidian's items array, DOM order, or persistence; unloading must restore the stock ribbon.
- The settings tab is **dual-path**: `getSettingDefinitions()` for Obsidian 1.13+ (feeds settings search) plus `display()` as the officially sanctioned < 1.13 fallback. `minAppVersion` stays 1.8.7 until every target device runs ≥ 1.13 — then delete the fallback and its `no-deprecated` scope-off in `eslint.config.mts`.
- The eslint preset forbids ALL inline `eslint-disable` comments: fix the code, or add a scoped block with a rationale comment in `eslint.config.mts`. Gotcha: the sentence-case rule's `brands` option REPLACES the default brand list — 'Obsidian' must stay listed explicitly.
- Status bar: an untouched config leaves a byte-for-byte native bar; pinned (self-positioned) items never receive an `order`; own-layer hide is the `ribbon-organizer-sb-hidden` class, never inline `display` (owners rewrite their inline display and would erase it); learned samples live in device localStorage, never `data.json`.

## Toolchain provenance

Unlike config-sync, this repo has no `template` git remote: the toolchain files (esbuild config, eslint config, version-bump.mjs, CI workflows, tsconfig) were vendored by hand from obsidian-config-sync (itself rooted at `obsidianmd/obsidian-sample-plugin`). When config-sync takes upstream template updates, realign these files manually.

## Smoke testing

`dev/vault/` (gitignored — never commit it) is a disposable Obsidian vault for CLI-driven smoke tests. Install the current build with `npm run smoke:install`, then drive the RUNNING app with the official CLI (`/Applications/Obsidian.app/Contents/MacOS/obsidian-cli`):

- `vaults verbose` lists registered vaults; target one with `vault=<folder-basename>` (or `cd` into the vault — the CLI routes by CWD).
- `plugin:reload id=ribbon-organizer` hot-reloads a dev build; `dev:errors` shows console errors; `dev:dom` / `dev:screenshot` inspect UI.
- Drive the app via `eval code=...`: `app.setting.open()` + `app.setting.openTabById('ribbon-organizer')` opens the settings tab; query the DOM to assert on panel state; `app.plugins.disablePlugin/enablePlugin` cold-restarts the plugin.
- **Vault registration is human-only**: the CLI cannot register or open new vaults; a human must "Open folder as vault" + Trust once. CLI calls against a stale vault hang (~2 min).
- Never smoke-test in a real vault.

## Rules

- Errors must carry context (group id, item id, command id). No silent fallback — the `ribbonInternals()`/statusBar null → Notice + session latch is the only sanctioned incompatibility path.
- Grouping runs on every platform through two mechanisms — desktop/tablet via flex `order` (`applyGrouping`), phones via the observed navbar ribbon menu (`observeMenus`/`groupRibbonMenu`); quick menus must keep working on mobile (`isDesktopOnly: false`).
- Documentation currency: when a change alters user-facing behavior (features, UI, settings, workflows), update the affected docs in the SAME branch — `README.md` and `README.zh.md` (keep the two in sync), `docs/GUIDE.md` (the user guide — behavioral detail lives there, not in the READMEs), `docs/DESIGN.md` (for UI changes), and `docs/ARCHITECTURE.md` (code map / invariants, when structure changes). Pure internal refactors that change nothing a user sees need no doc edit. Gate: docs must be current before merging to `main` and before cutting a release.
- Docs state the current system, not its history: `README*`, `docs/GUIDE.md`, `docs/ARCHITECTURE.md` and `docs/DESIGN.md` describe how the plugin behaves now; what changed in which release belongs in `CHANGELOG.md`. "As of this version", "used to", and "no longer" are the shapes to catch.
