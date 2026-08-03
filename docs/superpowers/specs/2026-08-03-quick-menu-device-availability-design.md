# Quick menus: hide device-empty menus from the ribbon — design

Date: 2026-08-03
Baseline: 0.17.0.

## Context

Quick menus sync across devices via data.json. On a device that lacks the plugins a menu's
commands belong to, the settings tab already greys the entries out ("Not on this device"),
but the menu's ribbon icon still appears and clicking it opens a list where nothing is
clickable:

- `syncRibbonMenus()` (`src/main.ts:875`) registers a ribbon icon for every menu
  unconditionally (`addRibbonIcon` at `:887`).
- `quickMenuEntries` (`src/core/quickCommands.ts`) collapses a menu to `[]` only when it has
  no command entries at all (`:40` keys on `kind`, not `disabled`), so an all-unavailable
  menu still renders as a non-empty list of disabled items — the empty-state placeholder
  (`main.ts:909-911`) never shows.
- Nothing re-evaluates availability mid-session: no plugin enable/disable watcher exists,
  and Obsidian has no official event for it.

Decisions (user): a menu with zero available commands on this device does not show its
ribbon icon at all; config is untouched and the settings tab keeps its greyed affordance.
Availability is judged only when the plugin loads (an app reload after installing a plugin
brings the icon back) — no event listeners, no polling, no `app.plugins` patching. No new
helper function: reuse the per-entry existence check that already exists.

## Scope

### 1. Gate the ribbon icon — `src/main.ts` `syncRibbonMenus()`

For each menu, build its entries with the existing `quickMenuEntries(menu.entries,
(id) => id in commands.commands)` — the same call `openMenu` already makes, which marks
each command entry `disabled` when its id is absent from the live registry. If no entry
has `kind === "command"` with `disabled === false`, run the existing removal path (DOM
element + `leftRibbon.items` entry by id `ribbon-organizer:<menu name>`) and skip
`addRibbonIcon`; otherwise register as today. Grouping needs no change: a hidden menu's
ribbon id is simply absent, so group pills and ordering adjust the way they already do for
any missing item.

Runtime click behavior for partially-available menus is unchanged: available entries run,
missing ones stay greyed with the owning plugin visible — mirroring the settings tab.

### 2. When availability is judged

Only at the moments `syncRibbonMenus()` already runs: plugin load (`onload`) and quick-menu
edits in settings. Installing or enabling a plugin mid-session restores the icon on the
next app reload (or any settings edit that rebuilds the menus). No `layout-change`
listener, no availability signature.

### 3. Docs — `docs/GUIDE.md`, Quick menus chapter

One sentence added next to the existing "greyed out … recovers automatically" sentence:
a menu whose commands are all missing on this device keeps its ribbon icon hidden, and the
icon returns once one of its plugins is back. Current-state voice; READMEs untouched
(behavioral detail lives in the GUIDE).

## Non-goals

- No new helper function or availability abstraction — the gate is an inline check on
  `quickMenuEntries` output.
- No filtering of greyed entries out of partially-available menus.
- No mid-session re-evaluation: no event listeners, no polling, no
  `app.plugins.enablePlugin/disablePlugin` patching.
- No settings-tab changes (the "Not on this device" affordance already ships).
- No change to ribbon-group membership semantics or the name-based ribbon id.

## Testing

- One Vitest case added to `tests/quickCommands.test.ts`: entries whose commands all miss
  the registry come back non-empty with every command entry `disabled` — the exact shape
  the gate keys on (the existing suite only covers the no-command-entries case).
- Existing suite stays green; gates: `npm run build`, `npm test` (108 baseline),
  `npm run lint`.
- Live verify in the dev vault: a menu whose only command belongs to a disabled plugin
  shows no ribbon icon after plugin (re)load; enabling that plugin and reloading brings
  the icon back; a mixed menu keeps its icon and greyed rows.
