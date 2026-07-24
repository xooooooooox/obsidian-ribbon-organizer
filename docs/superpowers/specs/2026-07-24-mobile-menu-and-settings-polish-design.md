# Mobile Menu Interception Rework + Settings Polish (0.7.0) — Design

Date: 2026-07-24
Status: Approved (brainstormed with owner; three mobile issues reported from on-device 0.6.1)

## Problems

1. **Phone ≡ ribbon menu ignores Ribbon Organizer grouping/ordering.** Hidden items are
   correctly absent (native behavior), but rows appear in raw registration order with no
   separators, and Commander-hidden rows still show.
2. **Ribbon settings item rows misaligned on phones.** The hidden chip / eye / move buttons sit
   directly after the title instead of right-aligned, and the "hidden" text chip is redundant.
3. **Tapping the eye toggle scrolls the settings list back to the top** (every full section
   re-render loses the scroll position; also affects drag-drop and move-to-group, and exists on
   desktop where it is merely less visible).

## Root causes (verified)

### Problem 1 — the 0.6.0 wrap never intercepts real taps

Verified against Obsidian's own bundle (`app.js` extracted from `obsidian.asar`), mobile navbar
constructor:

```js
this.showRibbonMenu = this.showRibbonMenu.bind(this);
this.onRibbonMenuClick = this.showRibbonMenu;              // bound ref captured at construction
...
el.addEventListener("click", (e) => t.onRibbonMenuClick(e)); // tap path reads onRibbonMenuClick
el.addEventListener("contextmenu", t.showRibbonMenu);        // long-press captured the original fn
```

Replacing the `showRibbonMenu` instance property (0.6.0's `wrapMobileRibbonMenu`) is therefore
never on the tap call chain, and can never be on the long-press chain. The 0.6.0 e2e passed only
because it invoked `app.mobileNavbar.showRibbonMenu(evt)` directly — the replaced property.

Two further facts from the same source, used below:

- `showRibbonMenu` builds the menu with `if (item.hidden) continue` — menu rows always equal
  `leftRibbon.items` filtered by native hidden, in array order. The existing single-candidate
  row↔item index alignment is correct; no tolerance branch is needed.
- `Menu.showAtPosition` appends the `.menu` element **as a direct child of `document.body`**,
  and first calls `setParentElement(ribbonMenuItemEl)` which adds class `has-active-menu` to the
  navbar's ≡ span. Phone menus also play a 150 ms slide-up animation, so a same-task reorder is
  invisible.

### Problem 2 — phone CSS hides the auto-margin carrier

Desktop right-alignment comes from `.ribbon-organizer-rg-plugin { margin-left: auto }` (the
plugin-name badge). `.is-phone` sets that badge to `display: none`, which also removes the only
auto margin in the row, so chip/eye/⋮ collapse against the title.

### Problem 3 — full re-render resets the scroll container

`GroupsSection.render()` / `QuickMenusSection.render()` empty and rebuild the section DOM on
every persist and on the eye toggle; the nearest scrollable ancestor's `scrollTop` resets to 0.

## Design

### 1. Menu-insertion observer replaces the showRibbonMenu wrap

- Delete `wrapMobileRibbonMenu()` and the `mobileNavbarWrapped` field/unload restore entirely.
- On mobile only (`Platform.isMobile`), at `onLayoutReady`, attach a `MutationObserver` to
  `document.body` with `{ childList: true }` (no subtree — menus are direct body children).
- Observer callback, for each added element node with class `menu`:
  - Read `app.mobileNavbar.ribbonMenuItemEl` (runtime-validated as `HTMLElement`; absent →
    do nothing).
  - If that element currently has class `has-active-menu`, the added menu is the navbar ≡
    ribbon menu → call `groupRibbonMenu(menuEl)`.
- `groupRibbonMenu` changes signature to take the observed menu element instead of guessing via
  "last `.menu` in `document.body`". Its internals are otherwise unchanged: index-align rows to
  `items.filter(!hidden)`, drop Commander-hidden rows, re-append per `computeMenuRows` with
  `.menu-separator` divs, re-render RO quick-menu icons via `renderIcon`. On any row-count
  mismatch the menu is left untouched (safety valve kept).
- The observer only ever mutates nodes *inside* the menu element, never `document.body`'s child
  list, so it cannot retrigger itself; no disconnect/reconnect dance. Disconnect on unload.
- This covers every open path by construction: tap, long-press, and the long-press menu when
  `mobileQuickRibbonItem` is configured.

### 2. Settings row alignment + hidden chip removal

- Remove the hidden chip: delete the `ribbon-organizer-rg-hiddenchip` span in
  `GroupsSection.renderItemRow` and its CSS rule. Hidden state remains expressed by the accent
  eye-off icon plus the greyed icon/title (both platforms — desktop and phone).
- Add `.is-phone .ribbon-organizer-rg-item .ribbon-organizer-rg-btns { margin-left: auto; }` so
  the buttons take over right-alignment where the plugin badge is display-none. Desktop rule
  stack unchanged.

### 3. Scroll preservation across section re-renders

- New helper `withScrollPreserved(el: HTMLElement, render: () => void): void` (new file
  `src/ui/scrollKeep.ts`): walk up from `el` to the nearest scrollable ancestor
  (`scrollHeight > clientHeight`), record `scrollTop`, run `render`, restore `scrollTop` —
  all in the same task, so no visible jump. If no scrollable ancestor exists (list shorter than
  the viewport), just run `render` — there is no scroll position to lose.
- Wrap the DOM rebuild in both `GroupsSection.render` and `QuickMenusSection.render`. This fixes
  the eye toggle, drag-drop, move-to-group, and every other persist-triggered re-render, on both
  platforms.

### 4. Diagnostics command "Copy ribbon diagnostics"

- `groupRibbonMenu` records a one-line outcome string on the plugin instance at every exit,
  e.g. `grouped: 14 rows, 2 dropped`, `bail: 14 rows vs 11 visible`, `no-internals`; initial
  value `not-run`.
- New command (id `copy-ribbon-diagnostics`) copies a JSON object to the clipboard via
  `navigator.clipboard.writeText` and confirms with a `Notice`:
  - `version` (manifest), platform flags (`isMobile`, `isPhone`, `isTablet`),
  - `mobileNavbar` present / `ribbonMenuItemEl` present / menu observer attached,
  - per ribbon item `{ id, nativeHidden, cmdrHidden }`,
  - `lastMenuOutcome`.
- Purpose: close the on-device verification loop (no console on iOS). Owner updates the phone,
  opens the ≡ menu once, runs the command, pastes the JSON back.

## Out of scope

- No changes to grouping semantics, `computeMenuRows`, desktop/tablet flex-order path, hide
  layers, or quick menus.
- The dual-candidate row alignment considered during brainstorming was dropped: the menu builder
  provably filters native-hidden items, so the single candidate is correct.

## Testing

- Existing 44 unit tests must stay green (no pure-core behavior changes).
- Dev-vault e2e (mobile emulation) must exercise the **real tap path** — dispatch a `click` on
  `mobileNavbar.ribbonMenuItemEl`, never call `showRibbonMenu` directly (that shortcut is what
  masked the 0.6.0 bug):
  - phone ≡ menu comes out grouped with separators, Commander-hidden rows dropped, moved rows
    still tappable;
  - settings: tap eye on a row deep in the list → hidden state flips, scroll position retained;
  - diagnostics command puts valid JSON on the clipboard with `lastMenuOutcome: grouped…`.
- Final confirmation on the owner's real phone via the diagnostics command.

## Docs & release

- Same branch: README.md + README.zh.md (diagnostics command, one line each) and
  docs/ARCHITECTURE.md (observer mechanism replaces the wrap; scroll preservation helper).
- Version: **0.7.0** (new command = minor). Usual gates: build clean, vitest green, lint 0,
  hand-written release notes at cut.
