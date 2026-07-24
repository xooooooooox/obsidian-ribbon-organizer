# CLAUDE.md

Obsidian plugin: the ribbon housekeeper — orders the left-ribbon icons into named groups with divider lines, and launches commands from a configurable ribbon menu. Grouping spec: `docs/superpowers/specs/2026-07-23-ribbon-grouping-design.md` (read it before changing `applyGrouping` or the settings panel); phone-menu spec: `docs/superpowers/specs/2026-07-24-mobile-menu-and-settings-polish-design.md` (read it before changing `observeMenus`/`groupRibbonMenu`). The Quick menus feature (formerly Quick commands) was extracted from [obsidian-config-sync](https://github.com/xooooooooox/obsidian-config-sync); the extraction spec lives in that repo.

## Commands

- `npm run dev` — esbuild watch → `main.js`
- `npm run build` — `tsc -noEmit` + production bundle (run before finishing any change)
- `npm test` — vitest; covers the pure `src/core/` layer only
- `npm run lint` — baseline is **zero warnings**
- `npm run smoke:install` — build and install into `./dev/vault` (gitignored) under plugin id `ribbon-organizer`
- Releasing: `npm version <x.y.z>` → `git push --follow-tags` → CI drafts the release → hand-write the release notes → publish the draft (BRAT needs a published release). Tags carry no `v` prefix. ⚠️ Force-pushing a tag re-triggers the release workflow on this repo — delete the duplicate draft it spawns.

## Architecture

Full code map, invariants, and extension points: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- `src/core/` — pure functions with no `obsidian` import; the only tested layer.
- `src/ui/` — the two-tab settings panel and fuzzy pickers; thin, no logic worth unit-testing.
- `src/main.ts` — plugin shell; the ONLY file that touches private API (`app.workspace.leftRibbon`, `app.commands`). `ribbonInternals()` runtime-validates the ribbon shape — on mismatch it returns null and grouping disables itself for the session (console.error + one Notice) instead of guessing.

## Key constraints

- Ribbon grouping is **visual-only**: flex `order` on the existing buttons plus injected divider divs. Never reorder Obsidian's items array, DOM order, or persistence; unloading must restore the stock ribbon.
- The settings tab is **dual-path**: `getSettingDefinitions()` for Obsidian 1.13+ (feeds settings search) plus `display()` as the officially sanctioned < 1.13 fallback. `minAppVersion` stays 1.8.7 until every target device runs ≥ 1.13 — then delete the fallback and its `no-deprecated` scope-off in `eslint.config.mts`.
- The eslint preset forbids ALL inline `eslint-disable` comments: fix the code, or add a scoped block with a rationale comment in `eslint.config.mts`. Gotcha: the sentence-case rule's `brands` option REPLACES the default brand list — 'Obsidian' must stay listed explicitly.

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

- Errors must carry context (group id, item id, command id). No silent fallback — the `ribbonInternals()` null → Notice + session latch is the one sanctioned incompatibility path.
- Grouping runs on every platform through two mechanisms — desktop/tablet via flex `order` (`applyGrouping`), phones via the observed navbar ribbon menu (`observeMenus`/`groupRibbonMenu`); quick menus must keep working on mobile (`isDesktopOnly: false`).
- Documentation currency: when a change alters user-facing behavior (features, UI, settings, workflows), update the affected docs in the SAME branch — `README.md` and `README.zh.md` (keep the two in sync) and `docs/ARCHITECTURE.md` (code map / invariants, when structure changes). Pure internal refactors that change nothing a user sees need no doc edit. Gate: docs must be current before merging to `main` and before cutting a release.
