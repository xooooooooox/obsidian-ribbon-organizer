# Architecture

Ribbon Organizer ships two features, both configured from one settings panel and persisted in the plugin's `data.json`:

1. **Ribbon groups** (desktop): orders the left-ribbon icons into named groups separated by thin divider lines, and hides/shows icons via an eye toggle that mirrors Obsidian's native hide and the Commander plugin's hide list.
2. **Quick commands**: a ribbon-menu launcher for user-picked commands with editable labels and icons (including iconize custom packs).

## Overview — three layers

- **`src/core/`** — pure functions, no `obsidian` import. All grouping arithmetic and menu-entry shaping lives here; this is the only layer with unit tests.
- **`src/ui/`** — the settings panel and fuzzy pickers. Thin: every state change delegates to a core function, saves, and re-renders its own container.
- **`src/main.ts`** — the plugin shell, and the only file that touches non-public API (`app.workspace.leftRibbon`, `app.commands`, `app.plugins` via `ui/iconRender.ts`'s iconize accessor). Private shapes are runtime-validated, never trusted.

## Module map (`src/`)

- **`main.ts`** — lifecycle and the two feature drivers.
  - Settings: `{ menus: QuickMenu[], groups: RibbonGroup[] }`; `loadSettings()` runs `normalizeMenus` (which also migrates the pre-0.4.0 flat `quickCommands` list into one menu) and `normalizeGroups`, so a hand-edited `data.json` can never crash the plugin. This shape has no hide field: hide state lives in Obsidian's native `leftRibbon` items and in the Commander plugin's own settings, never in Ribbon Organizer's `data.json`.
  - `ribbonInternals(app)` validates `app.workspace.leftRibbon` (`items[]` with `id`/`buttonEl`, plus `ribbonItemsEl`); returns null on any shape mismatch.
  - `cmdrAccess(app)` validates the Commander plugin (id `cmdr`) the same way, returning a three-state result — `absent` (not installed/enabled), `ok` (settings shape as expected, carries the plugin handle), `broken` (present but its `settings.hide` shape changed) — so every Commander touchpoint can branch on all three instead of assuming presence.
  - `rebuildCmdrStyle(hide)` replaces Commander's injected `<style id="cmdr">` the same way Commander itself does (remove, then re-append only when non-empty) using `commanderHide.ts`'s `cmdrHideStyleText`; needed because Commander's own stylesheet builder is module-private, so a same-session unhide would otherwise stay masked behind the stale rule.
  - `cmdrHiddenTitles()` reads the titles Commander currently hides (empty set when `cmdrAccess` isn't `ok`); combined with each item's native `hidden` flag this is the EFFECTIVE hidden state (native ∨ Commander) fed to both `ribbonSnapshot()` and `applyGrouping()`'s `computeRibbonLayout` call — the latter fix means a group whose members are hidden only via Commander no longer renders a phantom divider next to it.
  - `setIconHidden(itemId, hidden)` is the single entry point the settings UI calls to toggle a row: it mutates the raw `leftRibbon.items[].hidden` flag, calls `leftRibbon.onChange(true)` (native persistence; also rebuilds the ribbon's DOM children, which drops injected dividers — hence the `applyGrouping()` call right after), then edits Commander's `hide.leftRibbon` title list via `withTitle`, saves Commander's settings, and rebuilds its stylesheet. Commander absent → native-only, silent; Commander present but shape-broken → native-only plus one Notice.
  - `applyGrouping()` writes flex `order` onto each icon's `buttonEl` and injects `.ribbon-organizer-divider` divs per `computeRibbonLayout`; idempotent; guarded by `Platform.isDesktop` and a session latch (`groupingDisabled`) set when internals validation fails (console.error + one Notice).
  - `observeRibbon()` — a MutationObserver (childList + subtree + `class` attribute, 100 ms debounce) re-applies when icons appear late (lazy-loading plugins) or native hide/unhide toggles; it is disconnected while `applyGrouping` writes (so our own edits can't re-trigger it) and on unload.
  - `onunload()` clears every inline `order` and removes every injected divider — the stock ribbon returns instantly.
  - `syncRibbonMenus()` rebuilds the plugin's composite ribbon icons from `settings.menus` (full remove-and-re-register; grouping's flex `order` keeps positions stable). `openMenu(evt, menuId)` builds that menu's dropdown from `quickMenuEntries`; `menu.setUseNativeMenu(false)` forces a DOM menu because native macOS menus cannot render command/iconize icons.
  - `ribbonSnapshot()` is the settings UI's read-only view of the live ribbon; its `hidden` field is the effective (native ∨ Commander) state described above, not the raw native flag.
- **`core/ribbonGroups.ts`** — the grouping model. `RibbonGroup` (`id`/`name`/`items`), the `UNGROUPED_ID` sentinel, `defaultGroups`, `normalizeGroups`, `computeRibbonLayout`, and the pure mutations `addGroup` / `renameGroup` / `deleteGroup` / `moveGroup` / `moveItemToGroup` — all return fresh arrays and throw on unknown ids or sentinel violations.
- **`core/commanderHide.ts`** — pure, Obsidian-free: replicates the Commander plugin's hide-stylesheet rule format (`cmdrHideStyleText`, byte-for-byte — leftRibbon rules by title, then statusbar rules by plugin id, preserved verbatim) and a list helper (`withTitle`, add/remove a title exactly once). Exists because Commander's own CSS builder is module-private, so Ribbon Organizer must be able to reproduce it to rebuild the stylesheet after editing Commander's hide list.
- **`core/quickCommands.ts`** — `quickMenuEntries()`: flags commands not registered on this device as `disabled` and normalizes separators (no leading/trailing/consecutive; a list with no runnable command collapses to `[]`).
- **`core/quickMenus.ts`** — the quick-menus model: `defaultMenus`, `uniqueMenuName`, and `normalizeMenus` (validates persisted menus, fills missing ids, suffixes duplicate names, migrates the legacy flat `quickCommands` list).
- **`core/icons.ts`** — `iconChoices()`: composes Obsidian's built-in icon ids with iconize custom packs into one picker list (the `lucide-icons` pack is dropped — Obsidian already ships Lucide).
- **`core/types.ts`** — `QuickCommand` / `QuickSeparator` / `QuickEntry`, the `isSeparator` guard, and `QuickMenu` (one composite ribbon icon; ribbon id derives from `name`, `id` is the stable settings identity).
- **`ui/SettingTab.ts`** — the dual-path, two-tab panel. `getSettingDefinitions()` (Obsidian 1.13+) returns one render-type definition whose name/desc/aliases feed settings search and whose row element hosts the whole tabbed panel; `display()` renders the same panel as the official < 1.13 fallback. Delegates both tabs to their section classes.
- **`ui/GroupsSection.ts`** — the Ribbon tab: a single column mirroring the ribbon's final order (group headers mark where dividers render), with in-place filter, collapsible groups (default collapsed; session-only `expanded` set, chevron + count pill on headers — plain member count, or `visible/total` with the total dimmed once ≥1 member is effectively hidden; a non-empty filter query temporarily reveals matches inside collapsed groups without touching the stored state — two distinct hidden classes, `is-filtered-out` vs `is-collapsed`), HTML5 drag-and-drop (items within/across groups, whole groups onto headers; dropping on a collapsed header appends without expanding), an eye `ExtraButtonComponent` per live item row (calls `plugin.setIconHidden`, then re-renders — hide state lives outside this plugin's own settings, so a save-and-`persist()` isn't enough), a ⋮ "Move to group" menu, and inline rename (click the group name; no separate edit button). One instance lives on the SettingTab so filter text and collapse state survive re-renders; `persist()` = save → `applyGrouping()` → re-render own container (outer scroll position holds).
- **`ui/QuickMenusSection.ts`** — the Quick commands tab: one collapsible section per menu (default collapsed; session-only `expanded` set; new menu starts expanded), header = chevron + icon button (icon picker) + inline name input (empty/duplicate names revert — names are the ribbon ids) + command count + delete; body = the per-entry rows (icon button, label input, always-visible faint command id, trash; separators) with grip-handle drag-and-drop — drop on a row inserts before it, drop on a menu header appends to that menu's end (own header included; collapsed headers accept drops) — and that menu's add bar. Menu-level changes call `plugin.syncRibbonMenus()`; entry-level changes (including drag moves) only save.
- **`ui/iconRender.ts`** — `renderIcon()` fallback chain: Obsidian `setIcon` → iconize `setIconForNode` → the command's own icon → `"command"`; plus the iconize public-API accessor.
- **`ui/IconSelectModal.ts` / `ui/CommandSelectModal.ts`** — `FuzzySuggestModal` pickers over the icon catalog / command registry.

## Assets (`assets/`)

Brand assets outside `src/`, not bundled into the plugin: `icon.svg` (24×24, `currentColor` strokes — the RO-B mark, importable as a custom icon in Iconize), `logo.svg` (256×256, the mark on the gradient tile — used in the README header), and `social-preview.svg` (1280×640 — the GitHub repo social-preview image; render it to PNG when uploading, GitHub does not accept SVG there).

## Core invariants

1. **Grouping is visual-only.** Flex `order` + injected divider divs on `.side-dock-actions` (a flex column, so `order` fully controls visual sequence). `applyGrouping()` never touches Obsidian's items array, DOM node order, or drag persistence; unload or disable restores the stock ribbon. Hiding is the one deliberate exception: `setIconHidden()` writes the native `hidden` flag and Commander's hide list on purpose, as a separate, explicit call the settings UI makes — never as a side effect of grouping.
2. **Private API is validated, never trusted.** `ribbonInternals()` returning null means "internals changed shape" — grouping disables itself for the session with one Notice. No partial writes, no guessing.
3. **Match key = registration id** (`pluginId:title`, e.g. `config-sync:Config Sync`) — stable at runtime, unlike aria-labels which localize and change with state.
4. **Sentinel semantics.** Exactly one group with id `ungrouped` always exists in `settings.groups`; its `items` stays empty — membership is derived at layout time as "every live icon no other group claims". Its array position sets where unclaimed icons render. It cannot be renamed or deleted; `normalizeGroups` re-inserts it (at the end) when missing and repairs duplicates/malformed entries.
5. **Divider rule.** A divider renders only between ADJACENT NON-EMPTY groups, where non-empty means "has at least one live member that is not effectively hidden (native ∨ Commander)" — so hidden-only (by either layer) or absent-on-this-device groups never produce stray lines.
6. **Cross-device tolerance.** A configured item id absent from the live ribbon is skipped by layout and shown greyed ("Not on this device") in settings; it recovers automatically when its plugin returns. Same contract as quick commands' `disabled` flag.
7. **Settings tab is dual-path** (see module map). `minAppVersion` stays 1.8.7 until the `display()` fallback is dropped.
8. **Platform split.** Grouping is desktop-only (`Platform.isDesktop`); quick commands run everywhere (`isDesktopOnly: false`).

## Data model

`data.json` (rides whatever vault sync the user runs):

```json
{
  "menus": [
    {
      "id": "a41c…",
      "name": "Ribbon Organizer",
      "icon": "menu",
      "entries": [
        { "commandId": "remotely-save:start-sync", "label": "Sync now", "icon": "refresh-cw" },
        { "kind": "separator" }
      ]
    }
  ],
  "groups": [
    { "id": "b2f1…", "name": "Sync", "items": ["config-sync:Config Sync", "remotely-save:remotely-save"] },
    { "id": "ungrouped", "name": "Ungrouped", "items": [] }
  ]
}
```

`normalizeGroups` makes this hand-editable: malformed entries and duplicate group ids are dropped, duplicate item claims deduplicate first-group-wins, the sentinel's name/items are forced.

## Testing & gates

- `npm test` — vitest over `src/core/` only. `vitest.config.ts` aliases `obsidian` to `tests/mock-obsidian.ts` as an escape hatch, but that file does not exist yet: core stays `obsidian`-free by design, so nothing resolves the alias. Create the mock only when a test first genuinely needs an `obsidian` import.
- `npm run build` — `tsc -noEmit` + esbuild production bundle; run before finishing any change.
- `npm run lint` — zero-warning baseline; no inline disables (see CLAUDE.md).
- End-to-end: obsidian-cli against `dev/vault` (see CLAUDE.md "Smoke testing").

## How to extend

- **A new grouping behavior**: add a pure function to `core/ribbonGroups.ts` with tests, then wire it from `GroupsSection` (state change → `persist()`). `computeRibbonLayout` is the single source of truth for what the ribbon looks like.
- **A new quick-entry kind**: extend the `QuickEntry` union in `core/types.ts`, teach `quickMenuEntries` its menu shape and `normalizeMenus` its persisted shape, and add its row renderer in `QuickMenusSection.renderEntries`.
- **When every target device runs Obsidian ≥ 1.13**: raise `minAppVersion`, delete `display()` in `ui/SettingTab.ts` and the matching `no-deprecated` scope-off in `eslint.config.mts`.
