# More-Menu Tuck, Element-Anchored Cmdr Hide, Brand Icon V3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-icon "tuck into a ⋯ menu" for Ungrouped ribbon icons (customizable button icon), an element-anchored fix for the Commander-title hide being pierced by aria-label rewrites, and the V3 brand icon.

**Architecture:** Pure layout/normalize logic extends `src/core/ribbonGroups.ts` (tested with vitest); `src/main.ts` `applyGrouping` grows two element-anchored hide classes and an RO-owned more-button element (divider lifecycle); `src/ui/GroupsSection.ts` grows a per-row tuck button and a header icon slot reusing `IconSelectModal`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Obsidian plugin API + validated undocumented internals, vitest, esbuild.

Spec: `docs/superpowers/specs/2026-07-29-more-tuck-brand-icon-design.md` (mockup 定稿 rev 2, Model B).

## Global Constraints

- **NO git commits anywhere in this plan** — leave every change uncommitted (repo review convention). Ignore the usual commit steps.
- No version bump, no release actions (a cut is a separate, explicitly requested step).
- UI copy exact strings: tooltips **"Tuck into the menu"**, **"Show on the ribbon"**, **"Change the menu icon"**; more-button aria-label **"More"**.
- Default more icon id: `"ellipsis"`.
- data.json fields are additive only (`moreTucked`, `moreIcon`); old versions must load files containing them unchanged.
- New code follows repo style: comments explain constraints, not narration; no `any`; explicit types on exports.
- Gates before finishing: `npm test`, `npm run lint` (0 errors; warnings at existing baseline), `npm run build` — run from `~/local/coding/open/obsidian-ribbon-organizer`.

---

### Task 1: Pure layer — tucked layout + settings normalizers

**Files:**
- Modify: `src/core/ribbonGroups.ts` (interfaces at lines 12-20, `computeRibbonLayout` at lines 57-75, new exports at end of file)
- Test: `tests/ribbonGroups.test.ts`

**Interfaces:**
- Consumes: existing `RibbonGroup`, `UNGROUPED_ID`.
- Produces (later tasks rely on these exact names):
  - `LiveRibbonItem` gains required `tucked: boolean`
  - `RibbonLayout` gains `moreOrder: number | null`
  - `DEFAULT_MORE_ICON = "ellipsis"` (exported const)
  - `normalizeMoreTucked(raw: unknown): string[]`
  - `normalizeMoreIcon(raw: unknown): string`
  - `pruneTucked(groups: RibbonGroup[], moreTucked: string[]): string[]`

- [ ] **Step 1: Extend the test helper and write failing tests**

In `tests/ribbonGroups.test.ts`, change the existing helper (line 20) to:

```ts
const live = (id: string, hidden = false, tucked = false) => ({ id, hidden, tucked });
```

Append these describes at the end of the file:

```ts
describe("computeRibbonLayout more button", () => {
  it("emits moreOrder right after the sentinel members when a visible member is tucked", () => {
    const groups = [g("a", ["p:1"]), ungrouped(), g("b", ["p:2"])];
    const items = [live("p:1"), live("p:9", false, true), live("p:8"), live("p:2")];
    const { orders, dividerOrders, moreOrder } = computeRibbonLayout(groups, items);
    // a(1) divider(2) p:9(3) p:8(4) more(5) divider(6) p:2(7)
    expect(orders.get("p:1")).toBe(1);
    expect(orders.get("p:9")).toBe(3);
    expect(orders.get("p:8")).toBe(4);
    expect(moreOrder).toBe(5);
    expect(dividerOrders).toEqual([2, 6]);
    expect(orders.get("p:2")).toBe(7);
  });

  it("moreOrder is null when nothing is tucked", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    const { moreOrder } = computeRibbonLayout(groups, [live("p:1"), live("p:9")]);
    expect(moreOrder).toBeNull();
  });

  it("moreOrder is null when the only tucked member is hidden", () => {
    const groups = [ungrouped()];
    const { moreOrder } = computeRibbonLayout(groups, [live("p:9", true, true)]);
    expect(moreOrder).toBeNull();
  });

  it("a fully tucked (non-hidden) sentinel still earns its divider", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    const { dividerOrders, moreOrder } = computeRibbonLayout(groups, [live("p:1"), live("p:9", false, true)]);
    expect(dividerOrders).toHaveLength(1);
    expect(moreOrder).not.toBeNull();
  });

  it("ignores tucked on claimed members", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    const { moreOrder } = computeRibbonLayout(groups, [live("p:1", false, true)]);
    expect(moreOrder).toBeNull();
  });

  it("keeps the every-live-id-gets-an-order invariant with tucked members", () => {
    const groups = [ungrouped()];
    const { orders } = computeRibbonLayout(groups, [live("p:9", false, true), live("p:8")]);
    expect([...orders.keys()].sort()).toEqual(["p:8", "p:9"]);
  });
});

describe("more-menu settings normalizers", () => {
  it("normalizeMoreTucked keeps unique strings, else empty", () => {
    expect(normalizeMoreTucked(undefined)).toEqual([]);
    expect(normalizeMoreTucked("junk")).toEqual([]);
    expect(normalizeMoreTucked(["p:1", 42, "p:1", "p:2"])).toEqual(["p:1", "p:2"]);
  });

  it("normalizeMoreIcon defaults to ellipsis", () => {
    expect(normalizeMoreIcon(undefined)).toBe(DEFAULT_MORE_ICON);
    expect(normalizeMoreIcon("")).toBe("ellipsis");
    expect(normalizeMoreIcon(7)).toBe("ellipsis");
    expect(normalizeMoreIcon("menu")).toBe("menu");
  });

  it("pruneTucked drops claimed ids, keeps unclaimed, preserves order", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    expect(pruneTucked(groups, ["p:9", "p:1", "p:8"])).toEqual(["p:9", "p:8"]);
  });
});
```

Extend the import at the top of the test file with `DEFAULT_MORE_ICON, normalizeMoreIcon, normalizeMoreTucked, pruneTucked` (keep alphabetical order within the braces).

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `npm test -- ribbonGroups`
Expected: FAIL — `normalizeMoreTucked` etc. are not exported; `moreOrder` undefined.

- [ ] **Step 3: Implement in src/core/ribbonGroups.ts**

Interfaces (replace lines 12-20):

```ts
export interface LiveRibbonItem {
  id: string;
  hidden: boolean; // Obsidian's native right-click hide
  tucked: boolean; // collapsed into the more menu; honored for sentinel members only
}

export interface RibbonLayout {
  orders: Map<string, number>; // item id -> flex order (every live id gets one)
  dividerOrders: number[];     // flex order values for divider elements
  moreOrder: number | null;    // flex order for the more button; null = no tucked visible sentinel member
}
```

`computeRibbonLayout` (replace the whole function; only the `moreOrder` lines are new):

```ts
export function computeRibbonLayout(groups: RibbonGroup[], live: LiveRibbonItem[]): RibbonLayout {
  const claimed = new Set<string>(groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
  const liveById = new Map(live.map((i) => [i.id, i]));
  const orders = new Map<string, number>();
  const dividerOrders: number[] = [];
  let moreOrder: number | null = null;
  let next = 1;
  let anyVisibleBefore = false;
  for (const group of groups) {
    const memberIds =
      group.id === UNGROUPED_ID
        ? live.filter((i) => !claimed.has(i.id)).map((i) => i.id)
        : group.items.filter((id) => liveById.has(id));
    const visible = memberIds.some((id) => liveById.get(id)?.hidden === false);
    if (visible && anyVisibleBefore) dividerOrders.push(next++);
    for (const id of memberIds) orders.set(id, next++);
    // The more button stands at the end of the sentinel run; a tucked, non-hidden member is
    // what makes it exist. Tucked flags on claimed members are ignored (pruneTucked's belt).
    if (group.id === UNGROUPED_ID) {
      const anyTuckedVisible = memberIds.some((id) => {
        const it = liveById.get(id);
        return it !== undefined && !it.hidden && it.tucked;
      });
      if (anyTuckedVisible) moreOrder = next++;
    }
    if (visible) anyVisibleBefore = true;
  }
  return { orders, dividerOrders, moreOrder };
}
```

Append at the end of the file:

```ts
export const DEFAULT_MORE_ICON = "ellipsis";

// Defensive read of our own data.json: unique strings only, anything else dropped.
export function normalizeMoreTucked(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === "string" && !out.includes(v)) out.push(v);
  }
  return out;
}

export function normalizeMoreIcon(raw: unknown): string {
  return typeof raw === "string" && raw !== "" ? raw : DEFAULT_MORE_ICON;
}

// Tucking is only meaningful for unclaimed (Ungrouped) icons: a group claim wins and un-tucks.
export function pruneTucked(groups: RibbonGroup[], moreTucked: string[]): string[] {
  const claimed = new Set<string>(groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
  return moreTucked.filter((id) => !claimed.has(id));
}
```

- [ ] **Step 4: Run the test file, verify green**

Run: `npm test -- ribbonGroups`
Expected: PASS (all existing + new). `src/main.ts` does not compile yet against the new `LiveRibbonItem` — that is Task 3; vitest only compiles the imported core module, so this file's suite is green. Do NOT run `npm run build` in this task.

---

### Task 2: Brand icon V3 (three synced assets)

**Files:**
- Modify: `src/core/icons.ts:35-40` (`BRAND_ICON_SVG`)
- Modify: `assets/icon.svg`
- Modify: `assets/logo.svg` (same glyph, white strokes on the gradient tile)

**Interfaces:** none consumed/produced — static content. The V3 geometry: sidebar divider shortens to `M9 3v14.5`, full-width status bar `M2.5 17.5h19`, third sidebar dot (cy=17) removed, status text dash `M16.5 19.4h2.4` added.

- [ ] **Step 1: src/core/icons.ts**

Replace the `BRAND_ICON_SVG` value (keep the comment above it as-is):

```ts
export const BRAND_ICON_SVG =
  '<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v14.5"/><path d="M2.5 17.5h19"/>' +
  '<circle cx="5.75" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>' +
  '<circle cx="5.75" cy="11" r="1.2" fill="currentColor" stroke="none"/>' +
  '<path d="M4.4 14h2.7"/><path d="M16.5 19.4h2.4"/></g>';
```

- [ ] **Step 2: assets/icon.svg**

Replace the file content with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v14.5"/><path d="M2.5 17.5h19"/><circle cx="5.75" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="5.75" cy="11" r="1.2" fill="currentColor" stroke="none"/><path d="M4.4 14h2.7"/><path d="M16.5 19.4h2.4"/></svg>
```

- [ ] **Step 3: assets/logo.svg**

Replace line 5 (the glyph group's children) so the inner drawing matches, keeping the `#ffffff` strokes/fills:

```svg
    <rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v14.5"/><path d="M2.5 17.5h19"/><circle cx="5.75" cy="7.5" r="1.2" fill="#ffffff" stroke="none"/><circle cx="5.75" cy="11" r="1.2" fill="#ffffff" stroke="none"/><path d="M4.4 14h2.7"/><path d="M16.5 19.4h2.4"/>
```

- [ ] **Step 4: Verify**

Run: `npm test -- icons`
Expected: PASS (the brand test asserts scale + no `<svg>` root only). Visually confirm the three files carry identical path data (icon.svg vs the icons.ts string vs logo.svg line 5).

---

### Task 3: main.ts plumbing, element-anchored hide classes, more button

**Files:**
- Modify: `src/main.ts` — import (line 6), `RibbonOrganizerSettings` (lines 15-23), `loadSettings` (lines 208-240), `applyGrouping` (lines 637-665), `groupRibbonMenu` (line 762), new method `renderMoreButton` (insert after `applyGrouping`)
- Modify: `styles.css` (append near the `.ribbon-organizer-divider` rule, L61)

**Interfaces:**
- Consumes (Task 1): `LiveRibbonItem.tucked`, `RibbonLayout.moreOrder`, `normalizeMoreTucked`, `normalizeMoreIcon`, `pruneTucked`, `UNGROUPED_ID`.
- Produces: `settings.moreTucked: string[]`, `settings.moreIcon: string` (Task 4 reads/writes these); classes `ribbon-organizer-cmdr-hidden`, `ribbon-organizer-tucked`, element class `ribbon-organizer-more`.

- [ ] **Step 1: Imports and settings interface**

Line 6 becomes:

```ts
import { RibbonGroup, UNGROUPED_ID, computeMenuRows, computeRibbonLayout, defaultGroups, normalizeGroups, normalizeMoreIcon, normalizeMoreTucked, pruneTucked } from "./core/ribbonGroups";
```

Add to `RibbonOrganizerSettings` after the `groups` line:

```ts
  moreTucked: string[];           // ribbon item ids tucked into the more menu (Ungrouped members only; a group claim un-tucks)
  moreIcon: string;               // icon id for the more button; "ellipsis" until customized
```

- [ ] **Step 2: loadSettings**

Add `moreTucked?: unknown; moreIcon?: unknown;` to the `raw` cast. Then hoist groups so the prune can use it — the assignment becomes:

```ts
    const groups = normalizeGroups(raw.groups ?? defaultGroups());
    this.settings = {
      menus: normalizeMenus(raw.menus, raw.quickCommands), // pre-0.4.0 quickCommands migrates to one menu
      groups,
      moreTucked: pruneTucked(groups, normalizeMoreTucked(raw.moreTucked)),
      moreIcon: normalizeMoreIcon(raw.moreIcon),
      statusBarOrder: normalizeStatusBarOrder(raw.statusBarOrder),
      statusBarHidden: normalizeStatusBarOrder(raw.statusBarHidden),
      statusBarShowOnMobile: raw.statusBarShowOnMobile === true,
      statusBarModes: normalizeStatusBarModes(raw.statusBarModes),
      statusBarRules: normalizeStatusBarRules(raw.statusBarRules),
    };
```

- [ ] **Step 3: applyGrouping**

Replace the section from `const cmdrHidden = this.cmdrHiddenTitles();` to the end of the divider loop with:

```ts
    const cmdrHidden = this.cmdrHiddenTitles();
    const claimed = new Set(this.settings.groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
    const tucked = new Set(this.settings.moreTucked.filter((id) => !claimed.has(id)));
    // An unmounted entry has no element to order, so it counts as hidden for the layout: it
    // gets no divider slot and cannot make a group visible.
    const layout = computeRibbonLayout(
      this.settings.groups,
      internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title) || i.buttonEl === null, tucked: tucked.has(i.id) }))
    );
    for (const item of internals.items) {
      if (item.buttonEl === null) continue;
      const order = layout.orders.get(item.id);
      item.buttonEl.setCssStyles({ order: order === undefined ? "" : String(order) });
      // Element-anchored hide states: Commander's title-keyed CSS misses an icon whose plugin
      // temporarily rewrites its aria-label (remotely-save while syncing) — a class on the
      // element itself can't be pierced that way. Tucked icons leave the ribbon the same way.
      item.buttonEl.toggleClass("ribbon-organizer-cmdr-hidden", cmdrHidden.has(item.title));
      item.buttonEl.toggleClass("ribbon-organizer-tucked", tucked.has(item.id));
    }
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider, :scope > .ribbon-organizer-more"))) el.remove();
    for (const dividerOrder of layout.dividerOrders) {
      internals.ribbonItemsEl.createDiv({ cls: "ribbon-organizer-divider" }).setCssStyles({ order: String(dividerOrder) });
    }
    if (layout.moreOrder !== null) this.renderMoreButton(internals, tucked, cmdrHidden, layout.moreOrder);
```

(`this.observeRibbon(internals.ribbonItemsEl);` stays as the method's last line. The observer watches class attributes — it is disconnected during this method, same as before, so our own toggles never loop.)

- [ ] **Step 4: renderMoreButton (new method, insert directly after applyGrouping)**

```ts
  // The more button is RO-owned ribbon chrome, like the dividers — never a registered ribbon
  // item (registering one would list the button inside our own settings). Rebuilt every pass;
  // the menu mirrors openMenu's DOM-mode + renderIcon pattern so iconize ids work.
  private renderMoreButton(internals: RibbonInternals, tucked: Set<string>, cmdrHidden: Set<string>, order: number): void {
    const entries = internals.items.filter((i) => tucked.has(i.id) && i.buttonEl !== null && !i.hidden && !cmdrHidden.has(i.title));
    if (entries.length === 0) return; // hidden wins: nothing to open means no button
    const btn = internals.ribbonItemsEl.createDiv({
      cls: "side-dock-ribbon-action ribbon-organizer-more",
      attr: { "aria-label": "More", "aria-label-position": "right" },
    });
    renderIcon(btn, this.settings.moreIcon, undefined, this.app);
    btn.setCssStyles({ order: String(order) });
    btn.addEventListener("click", () => {
      const menu = new Menu();
      menu.setUseNativeMenu(false);
      for (const item of entries) {
        menu.addItem((mi) => {
          mi.setTitle(item.title);
          mi.setIcon(item.icon); // forces the icon slot to exist; renderIcon then fixes iconize ids
          const iconEl = (mi as unknown as { iconEl?: HTMLElement }).iconEl;
          if (iconEl) renderIcon(iconEl, item.icon, undefined, this.app);
          mi.onClick(() => item.buttonEl?.click()); // a display-hidden element still dispatches clicks
        });
      }
      const rect = btn.getBoundingClientRect();
      menu.showAtPosition({ x: rect.right, y: rect.top });
    });
  }
```

- [ ] **Step 5: groupRibbonMenu call site (line 762)**

```ts
    const effective = internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title), tucked: false }));
```

(`computeMenuRows` ignores `tucked` — the phone menu lists tucked icons on purpose.)

- [ ] **Step 6: onunload cleanup (review addendum)**

The more button and the two element-anchored classes are RO-owned state on a surface that outlives the plugin — `onunload` must sweep them like it sweeps dividers. Its ribbon tail becomes:

```ts
    for (const item of internals.items) {
      item.buttonEl?.setCssStyles({ order: "" });
      // Our stylesheet dies with the plugin, but the classes must not linger on foreign elements.
      item.buttonEl?.removeClass("ribbon-organizer-cmdr-hidden");
      item.buttonEl?.removeClass("ribbon-organizer-tucked");
    }
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider, :scope > .ribbon-organizer-more"))) el.remove();
```

- [ ] **Step 7: styles.css**

Append directly under the `.ribbon-organizer-divider` rule (L61):

```css
/* Element-anchored hide layers: Commander's title-keyed CSS misses an icon whose plugin
   temporarily rewrites its aria-label (remotely-save while syncing); a class pinned to the
   element itself cannot be pierced. Tucked = collapsed into the more menu. */
.side-dock-ribbon-action.ribbon-organizer-cmdr-hidden { display: none !important; content-visibility: hidden; }
.side-dock-ribbon-action.ribbon-organizer-tucked { display: none !important; }
```

- [ ] **Step 8: Verify**

Run: `npm test` → all suites PASS.
Run: `npm run build` → tsc + esbuild green (this is the first task after the `LiveRibbonItem` change where the whole program must compile). Note: the default `settings` field initializer also needs the two new fields (`moreTucked: normalizeMoreTucked(undefined)`, `moreIcon: normalizeMoreIcon(undefined)`) — the interface makes them required.

---

### Task 4: GroupsSection UI — tuck buttons + header icon slot

**Files:**
- Modify: `src/ui/GroupsSection.ts` — imports (lines 1-14), `renderGroupHeader` Ungrouped branch (lines 124-126), `renderItemRow` buttons (lines 184-196), `persist` (lines 326-332)
- Modify: `styles.css` (append after the `.ribbon-organizer-rg-btns .is-eye-off` rule, L97)

**Interfaces:**
- Consumes: `settings.moreTucked` / `settings.moreIcon` (Task 3), `pruneTucked` (Task 1), existing `IconSelectModal` (`new IconSelectModal(app, (icon) => void).open()`), `renderIcon(node, iconId, fallback, app)`.
- Produces: settings-UI classes `ribbon-organizer-rg-moreicon`, row-button state class `is-tucked`.

- [ ] **Step 1: Imports**

Add `pruneTucked` to the `../core/ribbonGroups` import list, and add:

```ts
import { IconSelectModal } from "./IconSelectModal";
```

- [ ] **Step 2: Ungrouped header icon slot**

In `renderGroupHeader`, replace the Ungrouped branch body (currently only the badge createSpan):

```ts
    if (group.id === UNGROUPED_ID) {
      hdr.createSpan({ cls: "ribbon-organizer-rg-badge", text: "New icons land here" });
      const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
      // The current more-menu icon; dashed frame = editable. Clicks land in rg-btns, which the
      // header's collapse-toggle listener already ignores.
      const iconBtn = btns.createEl("button", { cls: "ribbon-organizer-qc-icon ribbon-organizer-rg-moreicon", attr: { "aria-label": "Change the menu icon" } });
      renderIcon(iconBtn, this.plugin.settings.moreIcon, undefined, this.app);
      iconBtn.onclick = (): void => {
        new IconSelectModal(this.app, (icon) => {
          this.plugin.settings.moreIcon = icon;
          this.persist();
        }).open();
      };
    } else {
```

- [ ] **Step 3: Per-row tuck button (Ungrouped rows only)**

In `renderItemRow`, directly after the eye button's `if (live !== undefined) { ... }` block and before the `const more = new ExtraButtonComponent(btns)...` line, insert:

```ts
    if (live !== undefined && group.id === UNGROUPED_ID) {
      const isTucked = this.plugin.settings.moreTucked.includes(itemId);
      const tuck = new ExtraButtonComponent(btns)
        .setIcon(isTucked ? "chevrons-down-up" : "chevrons-up-down")
        .setTooltip(isTucked ? "Show on the ribbon" : "Tuck into the menu")
        .onClick(() => {
          const current = this.plugin.settings.moreTucked;
          this.plugin.settings.moreTucked = isTucked ? current.filter((t) => t !== itemId) : [...current, itemId];
          this.persist();
        });
      tuck.extraSettingsEl.toggleClass("is-tucked", isTucked);
    }
```

- [ ] **Step 4: persist() prunes claims**

```ts
  private persist(): void {
    void (async () => {
      // A group claim wins over tucking — prune on every mutation so a drag into a group un-tucks.
      this.plugin.settings.moreTucked = pruneTucked(this.plugin.settings.groups, this.plugin.settings.moreTucked);
      await this.plugin.saveSettings();
      this.plugin.applyGrouping();
      if (this.containerEl !== null) this.render(this.containerEl);
    })();
  }
```

- [ ] **Step 5: styles.css**

Append after the `.ribbon-organizer-rg-btns .is-eye-off` rule (L97):

```css
.ribbon-organizer-rg-btns .is-tucked { color: var(--text-accent); }
.ribbon-organizer-rg-moreicon { border: 1px dashed var(--background-modifier-border-hover); border-radius: 6px; }
```

(`ribbon-organizer-qc-icon` carries the base icon-button styling; the modifier only adds the dashed editable affordance.)

- [ ] **Step 6: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: tests PASS, lint 0 errors (warnings at baseline), build green.

---

### Task 5: Docs + dev-vault smoke

**Files:**
- Modify: `docs/DESIGN.md` (Icons + Interaction sections)
- Modify: `README.md`, `README.zh.md` (feature lists, keep the two line-parallel)

**Interfaces:** none — documentation of Tasks 1-4 exactly as built.

- [ ] **Step 1: DESIGN.md**

Under **## Icons**, add entries (match the section's existing list format):

- `chevrons-up-down` / `chevrons-down-up` — tuck states on Ungrouped rows: outward = "Tuck into the menu", inward (lit `--text-accent`) = "Show on the ribbon".
- `ellipsis` — the more button's default icon; user-replaceable via the icon picker.
- Dashed 1px border (`--background-modifier-border-hover`) = "this icon slot is editable" affordance (Ungrouped header).

Under **## Interaction**, add:

- The more button is RO-owned ribbon chrome (divider lifecycle), never a registered ribbon item; its menu mirrors the quick-menu pattern (DOM menu, icon + title per row, click = the original icon's action). Hidden icons never appear in it; an empty menu means no button.

- [ ] **Step 2: READMEs**

Add one feature bullet to each README's feature list, at the same list position in both files.

EN (`README.md`):

```md
- **Tuck Ungrouped icons into a menu** — mark any Ungrouped icon and it moves off the ribbon into one ⋯ button (icon customizable); click the button to reach them.
```

中文 (`README.zh.md`):

```md
- **把 Ungrouped 图标收进菜单** — 勾选任意 Ungrouped 图标,它就从 ribbon 收进一个 ⋯ 按钮(图标可自定义);点按钮即可使用。
```

- [ ] **Step 3: Final gates**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 4: Dev-vault smoke checklist**

Run `npm run smoke:install`, open the dev vault, then verify:

1. Ribbon groups tab: Ungrouped rows show the tuck button; Ungrouped header shows the dashed ⋯ icon slot.
2. Tuck two icons → they leave the ribbon; one ⋯ button appears at the end of the Ungrouped run; divider layout unchanged.
3. Click ⋯ → menu lists the two icons with icons + titles; clicking an entry triggers the original action.
4. Untuck both → button disappears.
5. Change the menu icon via the header slot → button re-renders with the new icon; restart-free.
6. Drag a tucked icon into a group → it un-tucks (appears in the group on the ribbon).
7. Cmdr-pierce regression: with a Commander-hidden icon (title in cmdr's `hide.leftRibbon`), set `el.setAttribute("aria-label", "something else")` on its button in the console → the icon must stay hidden (`ribbon-organizer-cmdr-hidden` class present).
8. Brand icon: settings tab + ribbon show the V3 glyph.

---

## Self-Review (done at write time)

- Spec coverage: §1 → Task 2 (three assets); §2 → Task 3 steps 3+6; §3 data model → Tasks 1+3, layout → Task 1, rendering → Task 3, settings UI → Task 4; testing section → Task 1 tests + Task 5 smoke; docs → Task 5. No gaps.
- Placeholders: none; all code verbatim.
- Type consistency: `tucked` required on `LiveRibbonItem`, both `computeRibbonLayout` (Task 3 step 3) and `computeMenuRows` (Task 3 step 5) call sites updated; names `normalizeMoreTucked`/`normalizeMoreIcon`/`pruneTucked`/`DEFAULT_MORE_ICON` used identically in Tasks 1, 3, 4.
