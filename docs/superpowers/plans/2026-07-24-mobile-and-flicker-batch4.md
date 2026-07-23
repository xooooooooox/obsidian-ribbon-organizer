# Mobile Support, Flicker Fix & Icon Rendering (batch-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the ribbon flicker (synchronous re-apply), unlock mobile (tablet drawer via the existing flex path, phone navbar ribbon menu via a post-processing wrap), fix iconize icons on ribbon buttons, register the brand icon natively, and add the phone settings CSS pass.

**Architecture:** Spec `docs/superpowers/specs/2026-07-24-mobile-and-flicker-batch4-design.md`. Pure model additions in `core/` (menu row sequence, brand icon constants, default icon), integration in `main.ts` (observer, addIcon, renderIcon, mobileNavbar wrap), UI gate removal in `GroupsSection`, CSS + docs last.

**Tech Stack:** TypeScript, Obsidian API, vitest, esbuild. No new dependencies.

## Global Constraints

- **NO git commits.** Working tree stays uncommitted (user review state). Never run `git commit`.
- Gates after each task: `npm run build` clean, `npx vitest run` all green, `npm run lint` **0 problems**. Inline eslint-disable comments are forbidden (preset rejects them); fix at config level or fix the code.
- UI copy is sentence case; brand words "Obsidian", "Commander", "Ribbon Organizer" keep their capitals (eslint sentence-case rule with `brands` option enforces this).
- Strict typing; no `any`. Undocumented Obsidian internals are accessed via `as unknown as {…}` narrow shapes with runtime validation, matching the existing `ribbonInternals` pattern.
- Comments state constraints the code can't show, in the existing terse style. No "added/changed X" comments.

---

### Task 1: Pure core — menu row sequence, brand icon constants, default menu icon

**Files:**
- Modify: `src/core/ribbonGroups.ts` (append after `computeRibbonLayout`, line 75)
- Modify: `src/core/icons.ts` (append at end)
- Modify: `src/core/quickMenus.ts:9` and `:39` (icon `"menu"` → `"ribbon-organizer"`)
- Modify: `src/ui/QuickMenusSection.ts:38` (icon `"menu"` → `"ribbon-organizer"`)
- Test: `tests/ribbonGroups.test.ts`, `tests/icons.test.ts`, `tests/quickMenus.test.ts`

**Interfaces:**
- Produces: `computeMenuRows(groups: RibbonGroup[], live: LiveRibbonItem[]): MenuRow[]` with `type MenuRow = { kind: "item"; id: string } | { kind: "separator" }` — Task 3 consumes it in `main.ts`.
- Produces: `BRAND_ICON_ID = "ribbon-organizer"` and `BRAND_ICON_SVG` (addIcon-ready inner SVG) from `src/core/icons.ts` — Task 2 consumes both.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ribbonGroups.test.ts` (import `computeMenuRows` alongside the existing imports from `../src/core/ribbonGroups`):

```ts
describe("computeMenuRows", () => {
  const groups = [
    { id: "g1", name: "A", items: ["p:one", "p:two"] },
    { id: UNGROUPED_ID, name: "Ungrouped", items: [] },
    { id: "g2", name: "B", items: ["p:three"] },
  ];

  it("lists visible members in group order with separators between non-empty groups", () => {
    const live = [
      { id: "p:three", hidden: false },
      { id: "p:one", hidden: false },
      { id: "p:free", hidden: false },
      { id: "p:two", hidden: false },
    ];
    expect(computeMenuRows(groups, live)).toEqual([
      { kind: "item", id: "p:one" },
      { kind: "item", id: "p:two" },
      { kind: "separator" },
      { kind: "item", id: "p:free" },
      { kind: "separator" },
      { kind: "item", id: "p:three" },
    ]);
  });

  it("omits hidden items and emits no separator around all-hidden groups", () => {
    const live = [
      { id: "p:one", hidden: true },
      { id: "p:two", hidden: true },
      { id: "p:free", hidden: false },
      { id: "p:three", hidden: false },
    ];
    expect(computeMenuRows(groups, live)).toEqual([
      { kind: "item", id: "p:free" },
      { kind: "separator" },
      { kind: "item", id: "p:three" },
    ]);
  });

  it("returns empty for no visible items", () => {
    expect(computeMenuRows(groups, [{ id: "p:one", hidden: true }])).toEqual([]);
  });
});
```

Append to `tests/icons.test.ts` (import `BRAND_ICON_ID, BRAND_ICON_SVG` from `../src/core/icons`):

```ts
describe("brand icon", () => {
  it("is addIcon-ready: scaled to the 100-viewBox grid, no <svg> root", () => {
    expect(BRAND_ICON_ID).toBe("ribbon-organizer");
    expect(BRAND_ICON_SVG).toContain('transform="scale(4.1667)"');
    expect(BRAND_ICON_SVG).not.toContain("<svg");
  });
});
```

In `tests/quickMenus.test.ts`, change the three `icon: "menu"` expectations (lines 8, 16, 84) to `icon: "ribbon-organizer"`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run`
Expected: FAIL — `computeMenuRows` not exported, `BRAND_ICON_ID` not exported, three quickMenus expectations mismatch.

- [ ] **Step 3: Implement**

Append to `src/core/ribbonGroups.ts`:

```ts
export type MenuRow = { kind: "item"; id: string } | { kind: "separator" };

// The phone navbar ribbon menu counterpart of computeRibbonLayout: same walk, but emitting the
// visible member ids as an ordered row list with a separator between adjacent non-empty groups.
// Hidden items are omitted entirely — the phone menu never renders them.
export function computeMenuRows(groups: RibbonGroup[], live: LiveRibbonItem[]): MenuRow[] {
  const claimed = new Set<string>(groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
  const liveById = new Map(live.map((i) => [i.id, i]));
  const rows: MenuRow[] = [];
  let anyVisibleBefore = false;
  for (const group of groups) {
    const memberIds =
      group.id === UNGROUPED_ID
        ? live.filter((i) => !claimed.has(i.id)).map((i) => i.id)
        : group.items.filter((id) => liveById.has(id));
    const visibleIds = memberIds.filter((id) => liveById.get(id)?.hidden === false);
    if (visibleIds.length === 0) continue;
    if (anyVisibleBefore) rows.push({ kind: "separator" });
    for (const id of visibleIds) rows.push({ kind: "item", id });
    anyVisibleBefore = true;
  }
  return rows;
}
```

Append to `src/core/icons.ts`:

```ts
export const BRAND_ICON_ID = "ribbon-organizer";

// assets/icon.svg inner content on the 0 0 100 100 grid addIcon renders into; 24 × 4.1667 ≈ 100,
// and the scaled stroke-width 2 keeps the drawn weight of a 24 px Lucide icon.
export const BRAND_ICON_SVG =
  '<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v18"/>' +
  '<circle cx="5.75" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>' +
  '<circle cx="5.75" cy="11" r="1.2" fill="currentColor" stroke="none"/>' +
  '<path d="M4.4 14h2.7"/><circle cx="5.75" cy="17" r="1.2" fill="currentColor" stroke="none"/></g>';
```

In `src/core/quickMenus.ts`: line 9 (`defaultMenus`) and line 39 (legacy migration) change `icon: "menu"` to `icon: "ribbon-organizer"`.

In `src/ui/QuickMenusSection.ts` line 38 change `icon: "menu",` to `icon: "ribbon-organizer",`.

- [ ] **Step 4: Run gates**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all tests pass, build clean, lint 0 problems. Do NOT commit.

---

### Task 2: main.ts — synchronous re-apply, brand icon registration, renderIcon on ribbon buttons

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `BRAND_ICON_ID`, `BRAND_ICON_SVG` from `./core/icons`; `renderIcon` from `./ui/iconRender` (already imported).
- Produces: no new exports. Behavior contract for Task 3: `observeRibbon` re-applies synchronously; `applyGrouping` unchanged in signature.

- [ ] **Step 1: Register the brand icon and render menu icons through the fallback chain**

In `src/main.ts`:

Add to the obsidian import (line 1): `addIcon`. Add import: `import { BRAND_ICON_ID, BRAND_ICON_SVG } from "./core/icons";`

In `onload()` insert `addIcon(BRAND_ICON_ID, BRAND_ICON_SVG);` immediately after `await this.loadSettings();` (must precede `syncRibbonMenus`, which may reference the id).

In `syncRibbonMenus()` change the registration loop:

```ts
    for (const menu of this.settings.menus) {
      const el = this.addRibbonIcon(menu.icon, menu.name, (evt) => this.openMenu(evt, menu.id));
      // addRibbonIcon resolves only registered icon ids; iconize pack ids render blank without
      // the fallback chain. Obsidian re-renders reuse this element, so once is enough.
      renderIcon(el, menu.icon, undefined, this.app);
      this.menuIcons.push({ name: menu.name, el });
    }
```

- [ ] **Step 2: Make the observer re-apply synchronously**

Replace `observeRibbon` (lines 200–213) with:

```ts
  // Re-applies when icons are added/removed (late-loading plugins, plugins rebuilding their own
  // buttons) or native hide/unhide toggles a class. Synchronous on purpose: observer callbacks
  // run at the microtask checkpoint, BEFORE the browser paints, so the restore is invisible —
  // a debounce here was the flicker users saw. applyGrouping disconnects this observer while it
  // writes, so our own edits never loop. Reconnected after every apply; disconnected on unload.
  private observeRibbon(ribbonItemsEl: HTMLElement): void {
    if (this.ribbonObserver === null) {
      this.ribbonObserver = new MutationObserver(() => this.applyGrouping());
    }
    this.ribbonObserver.observe(ribbonItemsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
```

Delete the field `private applyTimer: number | null = null;` (line 91) and the `onunload` line `if (this.applyTimer !== null) window.clearTimeout(this.applyTimer);` (line 104).

- [ ] **Step 3: Run gates**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all green, 0 lint problems. Do NOT commit.

---

### Task 3: Mobile — remove desktop gates, wrap the phone navbar ribbon menu

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/GroupsSection.ts`

**Interfaces:**
- Consumes: `computeMenuRows`, `MenuRow` from `./core/ribbonGroups` (Task 1); `renderIcon` (already imported in main.ts after Task 2); existing `ribbonInternals`, `cmdrHiddenTitles`.
- Produces: no new exports.

- [ ] **Step 1: Remove the desktop gates**

`src/main.ts` line 142: change

```ts
    if (!Platform.isDesktop || this.groupingDisabled) return;
```

to

```ts
    if (this.groupingDisabled) return;
```

`Platform` becomes unused in main.ts — remove it from the obsidian import.

`src/ui/GroupsSection.ts`: delete lines 44–47 (the `if (!Platform.isDesktop) {…}` block) and remove `Platform` from the import on line 1. Update the description div (line 41) text to:

```
"Order the left-ribbon icons into groups and toggle their visibility. Hiding an icon here also hides it in Obsidian and Commander; a divider renders between adjacent non-empty groups. On phones the grouping shapes the navbar ribbon menu; on tablets the drawer ribbon."
```

- [ ] **Step 2: Add the navbar ribbon menu wrap**

In `src/main.ts` add fields after `groupingDisabled`:

```ts
  private mobileNavbarWrapped: { navbar: { showRibbonMenu: (evt: Event) => void }; original: (evt: Event) => void } | null = null;
```

Change the `onload` layout hook to:

```ts
    this.app.workspace.onLayoutReady(() => {
      this.applyGrouping();
      this.wrapMobileRibbonMenu();
    });
```

Add to `onunload()` (before the internals cleanup):

```ts
    if (this.mobileNavbarWrapped !== null) {
      this.mobileNavbarWrapped.navbar.showRibbonMenu = this.mobileNavbarWrapped.original;
      this.mobileNavbarWrapped = null;
    }
```

Add the two methods (after `setIconHidden`):

```ts
  // Phone surface: the navbar ≡ button REBUILDS a standard Menu from leftRibbon.items on every
  // open, in array order, skipping natively hidden items — flex order does not apply to it.
  // Wrap it and regroup the freshly built menu in the same task: the browser has not painted
  // yet, so the reorder is invisible. Absent on desktop; missing internals leave native behavior.
  private wrapMobileRibbonMenu(): void {
    const navbar = (this.app as unknown as { mobileNavbar?: { showRibbonMenu?: unknown } }).mobileNavbar;
    if (navbar === undefined || navbar === null || typeof navbar.showRibbonMenu !== "function") return;
    const target = navbar as { showRibbonMenu: (evt: Event) => void };
    const original = target.showRibbonMenu;
    this.mobileNavbarWrapped = { navbar: target, original };
    target.showRibbonMenu = (evt: Event): void => {
      original.call(target, evt);
      this.groupRibbonMenu();
    };
  }

  // Row↔item mapping is index alignment: one .menu-item per non-natively-hidden item, in items
  // order. On any mismatch (Obsidian changed the menu shape) the menu is left untouched —
  // native order, degraded but correct. Commander's CSS hide targets side-dock-ribbon-action
  // elements and misses these rows, so Commander-hidden titles are dropped here explicitly.
  private groupRibbonMenu(): void {
    const internals = ribbonInternals(this.app);
    if (internals === null) return;
    const menus = document.body.querySelectorAll(".menu");
    const menuEl = menus[menus.length - 1];
    if (menuEl === undefined) return;
    const rowEls = Array.from(menuEl.querySelectorAll(".menu-item"));
    const nativeVisible = internals.items.filter((i) => !i.hidden);
    if (rowEls.length !== nativeVisible.length || rowEls.length === 0) return;
    const container = rowEls[0]?.parentElement;
    if (container === null || container === undefined) return;
    const cmdrHidden = this.cmdrHiddenTitles();
    const rowById = new Map<string, Element>();
    nativeVisible.forEach((item, i) => {
      const row = rowEls[i];
      if (row === undefined) return;
      if (cmdrHidden.has(item.title)) row.remove();
      else rowById.set(item.id, row);
    });
    const effective = internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title) }));
    for (const menuRow of computeMenuRows(this.settings.groups, effective)) {
      if (menuRow.kind === "separator") {
        container.createDiv({ cls: "menu-separator" });
        continue;
      }
      const el = rowById.get(menuRow.id);
      if (el === undefined) continue;
      container.appendChild(el); // a DOM move keeps the row's tap handler
      const quickMenu = this.settings.menus.find((m) => `${this.manifest.id}:${m.name}` === menuRow.id);
      const iconEl = el.querySelector(".menu-item-icon");
      if (quickMenu !== undefined && iconEl instanceof HTMLElement) renderIcon(iconEl, quickMenu.icon, undefined, this.app);
    }
  }
```

Extend the ribbonGroups import in main.ts with `computeMenuRows`.

- [ ] **Step 3: Run gates**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all green, 0 lint problems. Do NOT commit.

---

### Task 4: Phone settings CSS + docs currency

**Files:**
- Modify: `styles.css`
- Modify: `README.md`, `README.zh.md`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: CSS**

In `styles.css`, add `white-space: nowrap;` to the existing `.ribbon-organizer-rg-count` rule (line 79). Update the divider comment block (lines 45–47) to say "(desktop left ribbon and the tablet drawer ribbon)". Append at the end:

```css
/* Phone settings: two-line quick-command rows (command id gets its own full-width line),
 * name input fills the header, taller touch targets, plugin badge dropped for width. */
.is-phone .ribbon-organizer-qc-row { flex-wrap: wrap; }
.is-phone .ribbon-organizer-qc-cmdid { flex-basis: 100%; order: 10; max-width: none; margin-left: 39px; }
.is-phone .ribbon-organizer-qm-name { max-width: none; flex: 1; min-width: 0; }
.is-phone .ribbon-organizer-rg-hdr, .is-phone .ribbon-organizer-rg-item,
.is-phone .ribbon-organizer-qm-hdr { min-height: 40px; }
.is-phone .ribbon-organizer-rg-plugin { display: none; }
```

- [ ] **Step 2: Docs**

- `README.md`: remove every "desktop only" qualifier for grouping/hide. In the grouping feature bullet add: "Works on mobile too: tablets group the drawer ribbon; phones group the navbar ribbon menu (the ≡ button), including the separators." In the hide bullet add a sentence: "On phones, hidden icons also disappear from the navbar ribbon menu — including icons hidden only in Commander, which Obsidian's own menu would still show." Mention the natively registered `ribbon-organizer` icon id in the icon-picker paragraph (usable without Iconize) and that it is the default icon for new menus.
- `README.zh.md`: mirror the same three additions in Chinese (file uses full-width punctuation `，`/`；` — match it).
- `docs/ARCHITECTURE.md`: update the grouping section — observer now re-applies synchronously (pre-paint, flicker-free) with no debounce; new phone path: `wrapMobileRibbonMenu` wraps `app.mobileNavbar.showRibbonMenu`, post-processes via pure `computeMenuRows` (index-aligned rows, Commander titles dropped, `menu-separator` between groups); brand icon constants live in `core/icons.ts`, registered via `addIcon` at load.

- [ ] **Step 3: Run gates**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all green, 0 lint problems. Do NOT commit.

---

## After all tasks (controller, not subagents)

- Deploy build to the dev vault; e2e per spec Testing section (flicker rAF assertion, tablet drawer, phone menu via `showRibbonMenu(stubEvent)`, icon persistence, phone settings screenshot).
- Final whole-branch opus review; fix loop; report. Cut 0.6.0 only on the user's explicit "cut".
