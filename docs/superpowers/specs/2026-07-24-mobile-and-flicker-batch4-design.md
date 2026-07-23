# Mobile Support, Flicker Fix & Icon Rendering (batch-4) — Design

Date: 2026-07-24
Status: A1/B 定稿; A2 revised (phone surface corrected from drawer strip to navbar ribbon menu
per user screenshots) — pending re-定稿. Brand icon registered natively + default for new menus
(approved).

## Problem

Four user reports against 0.5.0:

1. **Ribbon flicker on every click of certain icons.** Clicking a ribbon action whose command
   makes a plugin rebuild its own ribbon button (remotely-save / config-sync style status icons)
   shows the un-grouped ribbon for ~100 ms before Ribbon Organizer re-applies. Verified in the
   dev vault: a rebuilt button starts with `style.order: ""` and `setChildrenInPlace` drops the
   dividers; the MutationObserver's 100 ms debounce is exactly the visible window.
2. **Settings panel layout breaks on phones** (cramped quick-command rows, truncated labels,
   count pill wrapping the `·` and the number onto two lines).
3. **Mobile is not supported.** `manifest.json` already says `isDesktopOnly: false`, but
   `applyGrouping` early-returns on `!Platform.isDesktop` and the Ribbon tab renders a
   "desktop only" placeholder. Verified via `app.emulateMobile(true)` (phone and tablet): the
   mobile `leftRibbon` internals are IDENTICAL to desktop — same `items` array shape
   (`id/icon/title/callback/hidden/buttonEl`), same `onChange` function, same
   `.side-dock-actions` flex-column container, mounted inside the left drawer
   (`.workspace-drawer-ribbon`). BUT the surface users actually see differs by device class:
   - **Tablet**: the drawer ribbon strip is the visible surface — the desktop flex-order +
     divider mechanism ports unchanged.
   - **Phone**: the visible surface is the **navbar ribbon menu** — the ≡ button in the
     bottom mobile navbar opens a standard `Menu` (`.menu` with `.menu-item` rows) that
     `app.mobileNavbar.showRibbonMenu()` REBUILDS from `leftRibbon.items` on every open,
     in array order, skipping `hidden: true` items (both facts verified in emulation).
     Flex order on `ribbonItemsEl` has no effect on it. Also verified: Commander's CSS hide
     (`div.side-dock-ribbon-action[aria-label=…]`) does NOT match `.menu-item` rows, so
     items hidden only via Commander leak into this menu.
4. **Quick-menu ribbon icons render blank** when the chosen icon id comes from an iconize pack
   (e.g. the imported brand icon). `syncRibbonMenus` registers via `addRibbonIcon(menu.icon, …)`,
   and Obsidian's `setIcon` only knows built-in/registered ids. The settings UI renders these
   fine because it goes through the `renderIcon` fallback chain; the ribbon button does not.

## Design

### 1. Synchronous re-apply (flicker fix)

`observeRibbon` drops the 100 ms `setTimeout` debounce and calls `applyGrouping()` synchronously
inside the MutationObserver callback. MutationObserver callbacks run at the microtask checkpoint,
BEFORE the browser paints — so the restore happens pre-paint and the flicker is structurally
impossible, no matter what other plugins do to their buttons.

- Loop safety is already in place: `applyGrouping` disconnects the observer before writing and
  reconnects after, so our own writes never re-trigger the callback.
- The `applyTimer` field and its `onunload` cleanup go away.
- Cost: `applyGrouping` is a few dozen style writes; running it once per external mutation batch
  is negligible (config-sync's status `toggleClass` fires it too — measured harmless).

### 2. Mobile support

Two mechanisms, one per surface:

**2a. Drawer ribbon (tablet; also desktop unchanged)**

- `applyGrouping` guard becomes `if (this.groupingDisabled) return;` — the `Platform.isDesktop`
  check is removed. Everything else (internals validation → disable-on-shape-change) stays.
  The same flex-order + divider mechanism then covers desktop and the tablet drawer strip.

**2b. Phone navbar ribbon menu (post-processing wrap)**

- `onLayoutReady` wraps `app.mobileNavbar.showRibbonMenu` (original saved; restored in
  `onunload`; wrap skipped silently when the method or `app.mobileNavbar` is missing — that is
  the normal state on desktop, so no warning: the menu simply keeps native behavior).
- The wrapper calls the original, then post-processes the freshly built `.menu`
  **synchronously in the same task** (pre-paint, no flash):
  1. Map rows to items: rows are created from `leftRibbon.items` in array order, skipping
     `hidden: true` — so `items.filter(i => !i.hidden)[n] ↔ rows[n]` (index alignment,
     verified in emulation).
  2. Remove rows whose item title is in Commander's hide list (closes the Commander-leak).
  3. Re-append rows in `computeRibbonLayout` group order and insert a `.menu-separator` div
     between adjacent non-empty groups (DOM moves keep the rows' tap handlers).
  4. For rows belonging to this plugin's quick menus, re-render the row icon through the
     `renderIcon` chain (same iconize-blank fix as §3, menu-row edition:
     `.menu-item-icon` node).
  If the `.menu` cannot be found or rows/items counts do not align, the wrapper leaves the
  menu untouched (native order — degraded but correct).
- `GroupsSection` removes the `!Platform.isDesktop` placeholder ("Ribbon grouping applies to
  desktop only."); mobile renders the full groups UI.
- Ribbon tab description gains: "On phones the grouping shapes the navbar ribbon menu; on
  tablets the drawer ribbon." (sentence case; "Obsidian"/"Commander" stay capitalized per the
  lint brand list).
- The hide mirror (`setIconHidden`) needs no change: mobile `leftRibbon.onChange` exists and
  behaves identically; the native `hidden` flag already removes items from the phone menu, and
  Commander-only-hidden items are handled by step 2 above.
- Docs (README, README.zh, ARCHITECTURE) drop every "desktop only" qualifier and describe both
  mobile surfaces.

### 3. Icon rendering + native brand icon

- **Ribbon buttons go through the renderIcon chain.** In `syncRibbonMenus`, after
  `addRibbonIcon(menu.icon, …)` returns the element, call
  `renderIcon(el, menu.icon, undefined, this.app)`. `renderIcon` empties the node first, so
  built-in ids render exactly as before (single `setIcon` result); iconize ids now resolve via
  the pack; misses fall back to the `command` glyph. No repair pass elsewhere: Obsidian's
  `onChange`/`setChildrenInPlace` reuses the same button element, so the injected SVG survives
  native re-renders (e2e-verified).
- **Brand icon registered natively.** `src/core/icons.ts` exports
  `BRAND_ICON_ID = "ribbon-organizer"` and `BRAND_ICON_SVG` — the `assets/icon.svg` inner
  content wrapped in `<g transform="scale(4.1667)" …>` so it fits `addIcon`'s 0 0 100 100
  viewBox (stroke-width 2 × 4.1667 ≈ 8.33 keeps the drawn weight identical to a 24 px lucide
  icon). `onload` calls `addIcon(BRAND_ICON_ID, BRAND_ICON_SVG)` before `syncRibbonMenus`.
  `getIconIds()` picks it up automatically, so the icon picker lists it with no picker change.
- **Default icon for new menus** becomes `"ribbon-organizer"` (was `"menu"`): in
  `defaultMenus()`, in the pre-0.4.0 migration branch of `normalizeMenus`, and in the
  Quick commands "New menu" button. Existing menus keep whatever icon they have.

### 4. Mobile settings CSS (styles.css only, `.is-phone` scoped)

Per mockup B; desktop layout unchanged (rules scoped under `body.is-phone`):

- **Quick-command rows wrap to two lines**: `.ribbon-organizer-qc-row { flex-wrap: wrap; }`,
  `.ribbon-organizer-qc-cmdid { flex-basis: 100%; order: 10; max-width: none; margin-left: 39px; }`
  — line 1 is grip + icon + label + delete; line 2 is the full-width faint command id.
- **Menu-header name input fills the row**: `.ribbon-organizer-qm-name { max-width: none; }`
  (it already sits in a flex row; `flex: 1; min-width: 0` on phone).
- **Touch targets**: group headers and item rows get `min-height: 40px` on phone.
- **Plugin badge hidden on phone**: `.ribbon-organizer-rg-plugin { display: none; }` — row tail
  keeps eye + ⋮ only (mockup A1).
- **Count pill never wraps** (global fix, not phone-scoped — reproduced in emulation):
  `.ribbon-organizer-rg-count { white-space: nowrap; }`.
- No blind fix for the tab-bar/header overlap in the user's phone screenshot: that device still
  runs 0.4.x and loads a personal mobile snippet; my phone emulation of the current code shows
  no overlap. Re-verify on the real device after the 0.6.0 update; fix only what reproduces.

## Out of scope

- Commander title-keyed hide semantics (unchanged from 0.5.0).
- Social-preview PNG conversion, community-store submission (tracked separately).
- The advanced-toolbar/mobile-navbar surfaces (RO touches only the drawer ribbon).

## Testing

- **Pure tests** (vitest): existing quickMenus tests updated for the new default icon; a test
  asserting `BRAND_ICON_SVG` contains the scale wrapper and no `<svg>` root tag.
- **e2e (dev vault, obsidian-cli)**:
  - Flicker: arm a logger, simulate an external button rebuild (remove + re-append), assert
    `style.order` and dividers are restored by the first `requestAnimationFrame` (pre-paint).
  - Tablet: `app.emulateMobile(true)` at tablet width → orders + dividers present in the
    drawer ribbon; restore desktop after.
  - Phone: `window.resizeTo(400, 850)` + `app.emulateMobile(true)` →
    `app.mobileNavbar.showRibbonMenu(stubEvent)` → rows in group order, separators between
    groups, a native-hidden item absent, a Commander-only-hidden item absent, RO quick-menu
    row icon non-empty; eye toggle round-trips (native flag + `style#cmdr`).
  - Icon: a menu whose icon is an iconize id renders a non-empty SVG on the ribbon; after
    `leftRibbon.onChange(true)` the SVG is still there; the picker lists `ribbon-organizer`.
  - Phone settings screenshot: quick-command rows two-line, no pill wrap.
- **Gates**: `npm run build`, all vitest tests, lint 0 problems (inline disables forbidden).

## Release

Cut as **0.6.0** after dev-vault e2e passes and the user live-verifies on desktop; the phone
overlap item is confirmed on-device post-update (BRAT on mobile must be updated manually).
