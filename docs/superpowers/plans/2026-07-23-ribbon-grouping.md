# Ribbon Grouping (0.2.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ribbon Organizer 0.2.0 lets the user group, order, and divide the desktop left-ribbon icons from plugin settings, replacing the vault snippet `mystyle-ribbon.css`.

**Architecture:** A pure core (`computeRibbonLayout` + immutable group-mutation helpers) turns the configured groups plus a live-ribbon snapshot into flex `order` values and divider positions. A thin DOM layer in `main.ts` applies them (`buttonEl.style.order`, injected divider divs) behind a runtime-validated cast of the undocumented `app.workspace.leftRibbon`, re-applying via a debounced MutationObserver. A new settings section renders the single-column "ribbon mirror" UI with drag-and-drop.

**Tech Stack:** TypeScript, esbuild, vitest (pure layer only), eslint-plugin-obsidianmd. Spec: `docs/superpowers/specs/2026-07-23-ribbon-grouping-design.md`.

## Global Constraints

- **No git commits.** Leave all changes uncommitted — the working tree is the owner's review state; the owner commits at cut time. Never add Claude/AI attribution anywhere.
- Gates after every task: `npm run lint` → **0 problems**, `npm test` → all pass, `npm run build` → exits 0.
- No inline eslint disables — the preset's `eslint-comments/no-restricted-disable` forbids them. If a rule misfires on new code, scope it off in `eslint.config.mts` with a rationale comment (existing pattern at the bottom of that file).
- UI copy: English, sentence case ("Ribbon groups", not "Ribbon Groups"); "Ribbon Organizer" is a registered brand in the sentence-case rule.
- CSS classes use the `ribbon-organizer-` prefix (the spec's `.ro-divider` shorthand is implemented as `.ribbon-organizer-divider`).
- Core functions are pure: never mutate input arrays/objects; return new values. Explicit parameters, no multi-mode flags.
- Private Obsidian API surface is exactly `app.workspace.leftRibbon.items` (`id`, `title`, `icon`, `hidden`, `buttonEl`) and `app.workspace.leftRibbon.ribbonItemsEl`, accessed only through the runtime-validated `ribbonInternals()` in `main.ts`.
- Version lands at **0.2.0** in Task 4; tagging/releasing is user-gated and NOT part of this plan.

---

### Task 1: Pure core — `ribbonGroups.ts`

**Files:**
- Create: `src/core/ribbonGroups.ts`
- Test: `tests/ribbonGroups.test.ts`

**Interfaces:**
- Consumes: nothing (Obsidian-free, like `src/core/quickCommands.ts`).
- Produces (used verbatim by Tasks 2–3):
  - `UNGROUPED_ID: "ungrouped"` (const)
  - `interface RibbonGroup { id: string; name: string; items: string[] }`
  - `interface LiveRibbonItem { id: string; hidden: boolean }`
  - `interface RibbonLayout { orders: Map<string, number>; dividerOrders: number[] }`
  - `defaultGroups(): RibbonGroup[]`
  - `normalizeGroups(raw: unknown): RibbonGroup[]`
  - `computeRibbonLayout(groups: RibbonGroup[], live: LiveRibbonItem[]): RibbonLayout`
  - `addGroup(groups: RibbonGroup[], id: string, name: string): RibbonGroup[]`
  - `renameGroup(groups: RibbonGroup[], groupId: string, name: string): RibbonGroup[]`
  - `deleteGroup(groups: RibbonGroup[], groupId: string): RibbonGroup[]`
  - `moveGroup(groups: RibbonGroup[], groupId: string, toIndex: number): RibbonGroup[]`
  - `moveItemToGroup(groups: RibbonGroup[], itemId: string, targetGroupId: string, index?: number): RibbonGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/ribbonGroups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RibbonGroup,
  UNGROUPED_ID,
  addGroup,
  computeRibbonLayout,
  defaultGroups,
  deleteGroup,
  moveGroup,
  moveItemToGroup,
  normalizeGroups,
  renameGroup,
} from "../src/core/ribbonGroups";

const g = (id: string, items: string[]): RibbonGroup => ({ id, name: id, items });
const ungrouped = (): RibbonGroup => ({ id: UNGROUPED_ID, name: "Ungrouped", items: [] });
const live = (id: string, hidden = false) => ({ id, hidden });

describe("computeRibbonLayout", () => {
  it("orders claimed items by group walk and unclaimed into the sentinel slot", () => {
    const groups = [g("a", ["p:1", "p:2"]), ungrouped(), g("b", ["p:3"])];
    const items = [live("p:3"), live("p:9"), live("p:1"), live("p:2"), live("p:8")];
    const { orders } = computeRibbonLayout(groups, items);
    // group a, then unclaimed (live order p:9, p:8), then group b
    const sorted = [...orders.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(sorted).toEqual(["p:1", "p:2", "p:9", "p:8", "p:3"]);
  });

  it("skips configured ids absent from the live list", () => {
    const groups = [g("a", ["gone:x", "p:1"]), ungrouped()];
    const { orders } = computeRibbonLayout(groups, [live("p:1")]);
    expect(orders.has("gone:x")).toBe(false);
    expect(orders.has("p:1")).toBe(true);
  });

  it("emits dividers only between adjacent non-empty groups", () => {
    const groups = [g("a", ["p:1"]), g("empty", []), g("b", ["p:2"]), ungrouped()];
    const { orders, dividerOrders } = computeRibbonLayout(groups, [live("p:1"), live("p:2")]);
    // ungrouped is empty too: exactly one divider, between a and b
    expect(dividerOrders).toHaveLength(1);
    const d = dividerOrders[0] ?? NaN;
    expect(d).toBeGreaterThan(orders.get("p:1") ?? NaN);
    expect(d).toBeLessThan(orders.get("p:2") ?? NaN);
  });

  it("treats a group whose members are all natively hidden as empty for dividers", () => {
    const groups = [g("a", ["p:1"]), g("b", ["p:2"]), g("c", ["p:3"]), ungrouped()];
    const items = [live("p:1"), live("p:2", true), live("p:3")];
    const { orders, dividerOrders } = computeRibbonLayout(groups, items);
    expect(dividerOrders).toHaveLength(1); // a|c only — b is invisible
    expect(orders.has("p:2")).toBe(true); // hidden items still get an order value
  });

  it("emits no divider with a single non-empty group", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    expect(computeRibbonLayout(groups, [live("p:1")]).dividerOrders).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    const items = [live("p:1"), live("p:2")];
    const groupsCopy = structuredClone(groups);
    const itemsCopy = structuredClone(items);
    computeRibbonLayout(groups, items);
    expect(groups).toEqual(groupsCopy);
    expect(items).toEqual(itemsCopy);
  });
});

describe("normalizeGroups", () => {
  it("returns defaults for non-arrays", () => {
    expect(normalizeGroups(undefined)).toEqual(defaultGroups());
    expect(normalizeGroups("junk")).toEqual(defaultGroups());
  });

  it("drops malformed entries and duplicate item claims (first group wins)", () => {
    const out = normalizeGroups([
      { id: "a", name: "A", items: ["p:1", "p:2"] },
      { bogus: true },
      { id: "b", name: "B", items: ["p:2", "p:3", 42] },
      ungrouped(),
    ]);
    expect(out).toEqual([g2("a", "A", ["p:1", "p:2"]), g2("b", "B", ["p:3"]), ungrouped()]);
  });

  it("re-inserts a missing sentinel at the end and collapses extras", () => {
    expect(normalizeGroups([{ id: "a", name: "A", items: [] }])).toEqual([g2("a", "A", []), ungrouped()]);
    const twoSentinels = normalizeGroups([ungrouped(), { id: UNGROUPED_ID, name: "X", items: ["p:1"] }]);
    expect(twoSentinels).toEqual([ungrouped()]);
  });
});

const g2 = (id: string, name: string, items: string[]): RibbonGroup => ({ id, name, items });

describe("group mutations", () => {
  const base = (): RibbonGroup[] => [g("a", ["p:1", "p:2"]), ungrouped(), g("b", ["p:3"])];

  it("addGroup appends an empty group and rejects duplicate ids", () => {
    const out = addGroup(base(), "c", "New group");
    expect(out[3]).toEqual({ id: "c", name: "New group", items: [] });
    expect(() => addGroup(base(), "a", "Dup")).toThrow(/duplicate/);
  });

  it("renameGroup renames; sentinel and unknown ids throw", () => {
    expect(renameGroup(base(), "a", "Alpha")[0]?.name).toBe("Alpha");
    expect(() => renameGroup(base(), UNGROUPED_ID, "X")).toThrow(/ungrouped/);
    expect(() => renameGroup(base(), "nope", "X")).toThrow(/unknown group/);
  });

  it("deleteGroup removes the group (members implicitly fall to ungrouped); sentinel throws", () => {
    const out = deleteGroup(base(), "a");
    expect(out.map((x) => x.id)).toEqual([UNGROUPED_ID, "b"]);
    expect(() => deleteGroup(base(), UNGROUPED_ID)).toThrow(/ungrouped/);
  });

  it("moveGroup reorders by post-removal index, sentinel included", () => {
    expect(moveGroup(base(), "b", 0).map((x) => x.id)).toEqual(["b", "a", UNGROUPED_ID]);
    expect(moveGroup(base(), UNGROUPED_ID, 0).map((x) => x.id)).toEqual([UNGROUPED_ID, "a", "b"]);
  });

  it("moveItemToGroup removes from source and inserts at index (appends when omitted)", () => {
    const appended = moveItemToGroup(base(), "p:1", "b");
    expect(appended[0]?.items).toEqual(["p:2"]);
    expect(appended[2]?.items).toEqual(["p:3", "p:1"]);
    const inserted = moveItemToGroup(base(), "p:3", "a", 1);
    expect(inserted[0]?.items).toEqual(["p:1", "p:3", "p:2"]);
    expect(inserted[2]?.items).toEqual([]);
  });

  it("moveItemToGroup with target ungrouped only removes the claim", () => {
    const out = moveItemToGroup(base(), "p:1", UNGROUPED_ID);
    expect(out[0]?.items).toEqual(["p:2"]);
    expect(out[1]?.items).toEqual([]); // sentinel items stay empty — membership is derived
  });

  it("mutations never touch their input", () => {
    const groups = base();
    const copy = structuredClone(groups);
    moveItemToGroup(groups, "p:1", "b");
    deleteGroup(groups, "a");
    moveGroup(groups, "b", 0);
    expect(groups).toEqual(copy);
  });
});
```

Note: `g2` is declared after first use inside the same module scope (hoisted `const` is not hoisted — move `const g2 = …` line up next to `g` when writing the file; keep both helpers at the top).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/ribbonGroups'` (or equivalent resolve error). The existing `quickCommands` suite must still pass.

- [ ] **Step 3: Implement `src/core/ribbonGroups.ts`**

```ts
export const UNGROUPED_ID = "ungrouped";

// A named, ordered set of ribbon icons. The sentinel group (UNGROUPED_ID) also lives in the
// settings array — its position sets where unclaimed icons render — but its `items` stays
// empty: membership is derived at layout time as "every live icon no other group claims".
export interface RibbonGroup {
  id: string;      // stable internal id (crypto.randomUUID() at creation); UNGROUPED_ID reserved
  name: string;    // settings-only display name; fixed for the sentinel
  items: string[]; // ribbon item ids ("pluginId:title"); order = order within the group
}

export interface LiveRibbonItem {
  id: string;
  hidden: boolean; // Obsidian's native right-click hide
}

export interface RibbonLayout {
  orders: Map<string, number>; // item id -> flex order (every live id gets one)
  dividerOrders: number[];     // flex order values for divider elements
}

export function defaultGroups(): RibbonGroup[] {
  return [{ id: UNGROUPED_ID, name: "Ungrouped", items: [] }];
}

// Repairs a stored `groups` value (data.json is hand-editable): drops malformed entries and
// duplicate group ids, deduplicates item claims (first group wins), forces the sentinel's
// fixed name and empty items, and guarantees exactly one sentinel (appended when missing).
export function normalizeGroups(raw: unknown): RibbonGroup[] {
  if (!Array.isArray(raw)) return defaultGroups();
  const claimed = new Set<string>();
  const out: RibbonGroup[] = [];
  let hasSentinel = false;
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, items } = entry as { id?: unknown; name?: unknown; items?: unknown };
    if (typeof id !== "string" || typeof name !== "string" || !Array.isArray(items)) continue;
    if (out.some((o) => o.id === id)) continue;
    if (id === UNGROUPED_ID) {
      hasSentinel = true;
      out.push({ id: UNGROUPED_ID, name: "Ungrouped", items: [] });
      continue;
    }
    const cleanItems = items.filter((i): i is string => typeof i === "string" && !claimed.has(i));
    for (const i of cleanItems) claimed.add(i);
    out.push({ id, name, items: cleanItems });
  }
  if (!hasSentinel) out.push({ id: UNGROUPED_ID, name: "Ungrouped", items: [] });
  return out;
}

// Walks the groups in order, assigning strictly increasing flex-order numbers to every live
// member (sentinel members = unclaimed live icons in live order; configured-but-absent ids are
// skipped). A divider order is emitted between each pair of ADJACENT NON-EMPTY groups, where
// non-empty means "has at least one live, not natively hidden member" — hidden items still get
// an order value (harmless) but never make a group visible.
export function computeRibbonLayout(groups: RibbonGroup[], live: LiveRibbonItem[]): RibbonLayout {
  const claimed = new Set<string>(groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
  const liveById = new Map(live.map((i) => [i.id, i]));
  const orders = new Map<string, number>();
  const dividerOrders: number[] = [];
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
    if (visible) anyVisibleBefore = true;
  }
  return { orders, dividerOrders };
}

function requireGroupIndex(groups: RibbonGroup[], groupId: string): number {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) throw new Error(`Ribbon Organizer: unknown group id "${groupId}"`);
  return idx;
}

export function addGroup(groups: RibbonGroup[], id: string, name: string): RibbonGroup[] {
  if (groups.some((g) => g.id === id)) throw new Error(`Ribbon Organizer: duplicate group id "${id}"`);
  return [...groups, { id, name, items: [] }];
}

export function renameGroup(groups: RibbonGroup[], groupId: string, name: string): RibbonGroup[] {
  if (groupId === UNGROUPED_ID) throw new Error("Ribbon Organizer: the ungrouped bucket cannot be renamed");
  requireGroupIndex(groups, groupId);
  return groups.map((g) => (g.id === groupId ? { ...g, name } : g));
}

// Members of the deleted group become unclaimed, i.e. they fall to the ungrouped bucket.
export function deleteGroup(groups: RibbonGroup[], groupId: string): RibbonGroup[] {
  if (groupId === UNGROUPED_ID) throw new Error("Ribbon Organizer: the ungrouped bucket cannot be deleted");
  requireGroupIndex(groups, groupId);
  return groups.filter((g) => g.id !== groupId);
}

// toIndex addresses the array AFTER the group is removed (standard drag-drop semantics).
export function moveGroup(groups: RibbonGroup[], groupId: string, toIndex: number): RibbonGroup[] {
  const from = requireGroupIndex(groups, groupId);
  const out = [...groups];
  const [moved] = out.splice(from, 1);
  if (moved === undefined) return groups; // unreachable after requireGroupIndex
  out.splice(Math.max(0, Math.min(toIndex, out.length)), 0, moved);
  return out;
}

// Removes itemId from every group, then inserts it into the target's items at `index`
// (counted after the removal; appends when omitted). Target UNGROUPED_ID only removes the
// claim — ungrouped membership is derived, its items stay empty.
export function moveItemToGroup(groups: RibbonGroup[], itemId: string, targetGroupId: string, index?: number): RibbonGroup[] {
  requireGroupIndex(groups, targetGroupId);
  return groups.map((g) => {
    const items = g.items.filter((i) => i !== itemId);
    if (g.id !== targetGroupId || g.id === UNGROUPED_ID) {
      return items.length === g.items.length ? g : { ...g, items };
    }
    const at = Math.max(0, Math.min(index ?? items.length, items.length));
    return { ...g, items: [...items.slice(0, at), itemId, ...items.slice(at)] };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — both suites (`quickCommands`, `ribbonGroups`), 0 failures.

- [ ] **Step 5: Gates**

Run: `npm run lint` → 0 problems. Run: `npm run build` → exits 0.
Do NOT commit (global constraint).

---

### Task 2: Ribbon apply lifecycle in `main.ts` + divider CSS

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css` (append)

**Interfaces:**
- Consumes (Task 1): `RibbonGroup`, `defaultGroups()`, `normalizeGroups(raw)`, `computeRibbonLayout(groups, live)`.
- Produces (Task 3 relies on): on `RibbonOrganizerPlugin` — `settings.groups: RibbonGroup[]`, `applyGrouping(): void`, `ribbonSnapshot(): RibbonSnapshotItem[] | null`; exported `interface RibbonSnapshotItem { id: string; title: string; icon: string; hidden: boolean }`.

No unit tests: this is the thin DOM layer (repo strategy tests the pure layer only; live behavior is verified in the dev vault at the end of the plan). The gate is lint + build + existing tests.

- [ ] **Step 1: Rewrite `src/main.ts`**

Replace the full file with:

```ts
import { App, Menu, Notice, Platform, Plugin } from "obsidian";
import { quickMenuEntries } from "./core/quickCommands";
import { RibbonGroup, computeRibbonLayout, defaultGroups, normalizeGroups } from "./core/ribbonGroups";
import { QuickEntry } from "./core/types";
import { renderIcon } from "./ui/iconRender";
import { RibbonOrganizerSettingTab } from "./ui/SettingTab";

interface RibbonOrganizerSettings {
  quickCommands: QuickEntry[]; // commands + separators surfaced in the ribbon menu
  groups: RibbonGroup[];       // top-to-bottom ribbon group order (includes the ungrouped sentinel)
}

const DEFAULT_SETTINGS: RibbonOrganizerSettings = {
  quickCommands: [],
  groups: defaultGroups(),
};

// A live left-ribbon icon as exposed to the settings UI.
export interface RibbonSnapshotItem {
  id: string;    // registration id: "pluginId:title"
  title: string;
  icon: string;
  hidden: boolean;
}

interface RibbonInternalItem {
  id: string;
  title: string;
  icon: string;
  hidden: boolean;
  buttonEl: HTMLElement;
}

interface RibbonInternals {
  items: RibbonInternalItem[];
  ribbonItemsEl: HTMLElement;
}

// Undocumented internals: leftRibbon.items entries carry the registration id, the button
// element, and the native-hide flag; ribbonItemsEl is the .side-dock-actions flex-column
// container (flex `order` therefore fully controls visual sequence). Shape is validated at
// runtime — null means "these internals changed; do not touch the ribbon".
function ribbonInternals(app: App): RibbonInternals | null {
  const ribbon = (app.workspace as unknown as { leftRibbon?: { items?: unknown; ribbonItemsEl?: unknown } }).leftRibbon;
  if (ribbon === undefined || !Array.isArray(ribbon.items) || !(ribbon.ribbonItemsEl instanceof HTMLElement)) return null;
  const items: RibbonInternalItem[] = [];
  for (const raw of ribbon.items) {
    const it = raw as { id?: unknown; title?: unknown; icon?: unknown; hidden?: unknown; buttonEl?: unknown };
    if (typeof it.id !== "string" || !(it.buttonEl instanceof HTMLElement)) return null;
    items.push({
      id: it.id,
      title: typeof it.title === "string" ? it.title : it.id,
      icon: typeof it.icon === "string" ? it.icon : "",
      hidden: it.hidden === true,
      buttonEl: it.buttonEl,
    });
  }
  return { items, ribbonItemsEl: ribbon.ribbonItemsEl };
}

export default class RibbonOrganizerPlugin extends Plugin {
  settings: RibbonOrganizerSettings = DEFAULT_SETTINGS;
  private ribbonObserver: MutationObserver | null = null;
  private applyTimer: number | null = null;
  private groupingDisabled = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addRibbonIcon("menu", "Ribbon Organizer", (evt) => this.openMenu(evt));
    this.addSettingTab(new RibbonOrganizerSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.applyGrouping());
  }

  onunload(): void {
    this.ribbonObserver?.disconnect();
    this.ribbonObserver = null;
    if (this.applyTimer !== null) window.clearTimeout(this.applyTimer);
    const internals = ribbonInternals(this.app);
    if (internals === null) return;
    for (const item of internals.items) item.buttonEl.style.order = "";
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider"))) el.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<RibbonOrganizerSettings> | null);
    this.settings.quickCommands = [...this.settings.quickCommands]; // never alias DEFAULT_SETTINGS' array
    this.settings.groups = normalizeGroups(this.settings.groups);   // validates + always a fresh array
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // The settings UI's view of the live ribbon; null when the private internals changed shape.
  ribbonSnapshot(): RibbonSnapshotItem[] | null {
    const internals = ribbonInternals(this.app);
    if (internals === null) return null;
    return internals.items.map(({ id, title, icon, hidden }) => ({ id, title, icon, hidden }));
  }

  // Applies the configured grouping to the desktop left ribbon: flex order per icon plus one
  // divider element between adjacent non-empty groups. Idempotent; safe to call repeatedly.
  applyGrouping(): void {
    if (!Platform.isDesktop || this.groupingDisabled) return;
    const internals = ribbonInternals(this.app);
    if (internals === null) {
      this.groupingDisabled = true;
      console.error("Ribbon Organizer: app.workspace.leftRibbon does not match the expected shape; ribbon grouping is disabled for this session");
      new Notice("Ribbon Organizer: ribbon grouping is incompatible with this Obsidian version.");
      return;
    }
    // Disconnect while we write so our own DOM edits cannot re-trigger the observer.
    this.ribbonObserver?.disconnect();
    const layout = computeRibbonLayout(this.settings.groups, internals.items);
    for (const item of internals.items) {
      const order = layout.orders.get(item.id);
      item.buttonEl.style.order = order === undefined ? "" : String(order);
    }
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider"))) el.remove();
    for (const dividerOrder of layout.dividerOrders) {
      internals.ribbonItemsEl.createDiv({ cls: "ribbon-organizer-divider" }).style.order = String(dividerOrder);
    }
    this.observeRibbon(internals.ribbonItemsEl);
  }

  // Re-applies (debounced) when icons are added/removed (late-loading plugins) or native
  // hide/unhide toggles a class. Reconnected after every apply; disconnected on unload.
  private observeRibbon(ribbonItemsEl: HTMLElement): void {
    if (this.ribbonObserver === null) {
      this.ribbonObserver = new MutationObserver(() => {
        if (this.applyTimer !== null) window.clearTimeout(this.applyTimer);
        this.applyTimer = window.setTimeout(() => {
          this.applyTimer = null;
          this.applyGrouping();
        }, 100);
      });
    }
    this.ribbonObserver.observe(ribbonItemsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  private openMenu(evt: MouseEvent): void {
    const menu = new Menu();
    // Force a DOM menu: on macOS (nativeMenus default) this would render as a native OS menu,
    // which cannot show the built-in or iconize command icons. DOM mode renders them; no-op on
    // mobile, where menus are already DOM.
    menu.setUseNativeMenu(false);
    const commands = (this.app as unknown as {
      commands: { commands: Record<string, { icon?: string }>; executeCommandById: (id: string) => void };
    }).commands;
    const entries = quickMenuEntries(this.settings.quickCommands, (id) => id in commands.commands);
    if (entries.length === 0) {
      menu.addItem((i) => i.setTitle("No commands configured — add them in the plugin settings").setDisabled(true));
    }
    for (const e of entries) {
      if (e.kind === "separator") {
        menu.addSeparator();
        continue;
      }
      menu.addItem((i) => {
        i.setTitle(e.label);
        i.setIcon(e.icon); // forces the icon slot to exist; renderIcon then fixes iconize ids
        const iconEl = (i as unknown as { iconEl?: HTMLElement }).iconEl;
        if (iconEl) renderIcon(iconEl, e.icon, commands.commands[e.commandId]?.icon, this.app);
        if (e.disabled) i.setDisabled(true);
        else i.onClick(() => commands.executeCommandById(e.commandId));
      });
    }
    menu.showAtMouseEvent(evt);
  }
}
```

(`openMenu`, `saveSettings`, and the quick-commands half of `loadSettings` are unchanged from 0.1.1 — only the imports, settings interface/defaults, `groups` normalization, `onLayoutReady` hook, `onunload`, and the four new members are new.)

- [ ] **Step 2: Append divider CSS to `styles.css`**

```css
/* Ribbon grouping — divider between adjacent non-empty groups (desktop left ribbon).
 * A real flex child whose inline `order` slots it between two groups; the container's own
 * gap supplies the surrounding spacing. */
.ribbon-organizer-divider { flex: none; height: 0; border-top: 1px solid var(--background-modifier-border); margin: 2px 10%; }
```

- [ ] **Step 3: Gates**

Run: `npm test` → all pass (no new tests; nothing broke).
Run: `npm run lint` → 0 problems.
  - Contingency: if `eslint-plugin-obsidianmd` flags the dynamic `style.order` assignments (its style rules target static styling that belongs in CSS — these values are config-computed at runtime, which CSS cannot express), scope that one rule off for `src/main.ts` in `eslint.config.mts` with a rationale comment, following the existing `src/ui/SettingTab.ts` block. No inline disables.
Run: `npm run build` → exits 0.
Do NOT commit.

---

### Task 3: Groups settings section

**Files:**
- Create: `src/ui/GroupsSection.ts`
- Modify: `src/ui/SettingTab.ts`
- Modify: `styles.css` (append)

**Interfaces:**
- Consumes (Task 1): `UNGROUPED_ID`, `RibbonGroup`, `addGroup`, `renameGroup`, `deleteGroup`, `moveGroup`, `moveItemToGroup`. (Task 2): `plugin.settings.groups`, `plugin.applyGrouping()`, `plugin.ribbonSnapshot()`, `RibbonSnapshotItem`; `renderIcon` from `./iconRender`.
- Produces: `class GroupsSection { constructor(app: App, plugin: RibbonOrganizerPlugin, refresh: () => void); render(containerEl: HTMLElement): void }`.

- [ ] **Step 1: Create `src/ui/GroupsSection.ts`**

```ts
import { App, ButtonComponent, ExtraButtonComponent, Menu, Platform, Setting, setIcon } from "obsidian";
import {
  RibbonGroup,
  UNGROUPED_ID,
  addGroup,
  deleteGroup,
  moveGroup,
  moveItemToGroup,
  renameGroup,
} from "../core/ribbonGroups";
import { renderIcon } from "./iconRender";
import type RibbonOrganizerPlugin, { RibbonSnapshotItem } from "../main";

type DragPayload =
  | { type: "group"; groupId: string }
  | { type: "item"; itemId: string; fromGroupId: string; fromIndex: number };

// "Ribbon groups" settings section: a single column mirroring the ribbon's final order —
// group header rows mark where dividers render, item rows drag within/across groups, the
// ungrouped sentinel is the default landing bucket. One instance lives on the SettingTab so
// the filter text survives display() re-renders.
export class GroupsSection {
  private filterQuery = "";
  private drag: DragPayload | null = null;

  constructor(
    private app: App,
    private plugin: RibbonOrganizerPlugin,
    private refresh: () => void
  ) {}

  render(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Ribbon groups")
      .setDesc("Order the left-ribbon icons into groups. A divider line renders between adjacent non-empty groups; icons in no group fall into the ungrouped bucket.")
      .setHeading();

    if (!Platform.isDesktop) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Ribbon grouping applies to desktop only." });
      return;
    }
    const snapshot = this.plugin.ribbonSnapshot();
    if (snapshot === null) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Ribbon grouping is incompatible with this Obsidian version." });
      return;
    }
    const liveById = new Map(snapshot.map((i) => [i.id, i]));
    const claimed = new Set(this.plugin.settings.groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));

    const filterEl = containerEl.createEl("input", {
      cls: "ribbon-organizer-rg-filter",
      attr: { type: "search", placeholder: "Filter icons…" },
    });
    filterEl.value = this.filterQuery;

    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-rg-list" });
    const itemRows: { el: HTMLElement; haystack: string }[] = [];
    const applyFilter = (): void => {
      const q = this.filterQuery.trim().toLowerCase();
      for (const r of itemRows) r.el.toggleClass("is-filtered-out", q !== "" && !r.haystack.includes(q));
    };
    // Filtering toggles row visibility in place — no re-render, so the input keeps focus.
    filterEl.addEventListener("input", () => {
      this.filterQuery = filterEl.value;
      applyFilter();
    });

    this.plugin.settings.groups.forEach((group, groupIndex) => {
      this.renderGroupHeader(listEl, group, groupIndex);
      const members =
        group.id === UNGROUPED_ID
          ? snapshot.filter((i) => !claimed.has(i.id)).map((i) => ({ itemId: i.id, live: i as RibbonSnapshotItem | undefined }))
          : group.items.map((itemId) => ({ itemId, live: liveById.get(itemId) }));
      members.forEach((m, memberIndex) => {
        const row = this.renderItemRow(listEl, group, m.itemId, m.live, memberIndex);
        const pluginId = m.itemId.split(":")[0] ?? "";
        itemRows.push({ el: row, haystack: `${(m.live?.title ?? m.itemId).toLowerCase()} ${pluginId.toLowerCase()}` });
      });
    });
    applyFilter();

    const addbar = containerEl.createDiv({ cls: "ribbon-organizer-rg-addbar" });
    new ButtonComponent(addbar).setButtonText("New group").onClick(() => {
      this.plugin.settings.groups = addGroup(this.plugin.settings.groups, crypto.randomUUID(), "New group");
      this.persist();
    });
  }

  private renderGroupHeader(listEl: HTMLElement, group: RibbonGroup, groupIndex: number): void {
    const hdr = listEl.createDiv({ cls: "ribbon-organizer-rg-hdr", attr: { draggable: "true" } });
    const grip = hdr.createSpan({ cls: "ribbon-organizer-rg-grip" });
    setIcon(grip, "grip-vertical");
    const nameEl = hdr.createSpan({ cls: "ribbon-organizer-rg-name", text: group.name });
    if (group.id === UNGROUPED_ID) {
      hdr.createSpan({ cls: "ribbon-organizer-rg-badge", text: "New icons land here" });
    } else {
      const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
      new ExtraButtonComponent(btns).setIcon("pencil").setTooltip("Rename group").onClick(() => this.startRename(nameEl, group));
      new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete group (members fall to ungrouped)").onClick(() => {
        this.plugin.settings.groups = deleteGroup(this.plugin.settings.groups, group.id);
        this.persist();
      });
    }
    hdr.addEventListener("dragstart", (e) => this.onDragStart(e, { type: "group", groupId: group.id }));
    this.wireDropTarget(hdr, (payload) => {
      if (payload.type === "group") {
        if (payload.groupId === group.id) return;
        // Insert before this header; account for the source's removal shifting later indexes.
        const from = this.plugin.settings.groups.findIndex((g) => g.id === payload.groupId);
        const to = from !== -1 && from < groupIndex ? groupIndex - 1 : groupIndex;
        this.plugin.settings.groups = moveGroup(this.plugin.settings.groups, payload.groupId, to);
        this.persist();
        return;
      }
      // Item dropped on a header: append to that group (for the sentinel: just un-claim).
      this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, payload.itemId, group.id);
      this.persist();
    });
  }

  private renderItemRow(
    listEl: HTMLElement,
    group: RibbonGroup,
    itemId: string,
    live: RibbonSnapshotItem | undefined,
    memberIndex: number
  ): HTMLElement {
    const row = listEl.createDiv({ cls: "ribbon-organizer-rg-item", attr: { draggable: "true" } });
    if (live === undefined) row.addClass("is-missing");
    const grip = row.createSpan({ cls: "ribbon-organizer-rg-grip" });
    setIcon(grip, "grip-vertical");
    const iconEl = row.createSpan({ cls: "ribbon-organizer-rg-icon" });
    if (live !== undefined) renderIcon(iconEl, live.icon, undefined, this.app);
    else setIcon(iconEl, "help");
    row.createSpan({ cls: "ribbon-organizer-rg-title", text: live?.title ?? itemId });
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-rg-missing", text: "Not on this device" });
    row.createSpan({ cls: "ribbon-organizer-rg-plugin", text: itemId.split(":")[0] ?? "" });
    const btns = row.createDiv({ cls: "ribbon-organizer-rg-btns" });
    const more = new ExtraButtonComponent(btns).setIcon("ellipsis-vertical").setTooltip("Move to group");
    more.onClick(() => {
      const menu = new Menu();
      for (const target of this.plugin.settings.groups) {
        if (target.id === group.id) continue;
        menu.addItem((mi) =>
          mi.setTitle(target.id === UNGROUPED_ID ? "Move to ungrouped" : `Move to ${target.name}`).onClick(() => {
            this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, itemId, target.id);
            this.persist();
          })
        );
      }
      const rect = more.extraSettingsEl.getBoundingClientRect();
      menu.showAtPosition({ x: rect.right, y: rect.bottom });
    });

    row.addEventListener("dragstart", (e) => this.onDragStart(e, { type: "item", itemId, fromGroupId: group.id, fromIndex: memberIndex }));
    this.wireDropTarget(row, (payload) => {
      if (payload.type === "group") return; // groups drop on headers only
      if (group.id === UNGROUPED_ID) {
        if (payload.fromGroupId === UNGROUPED_ID) return; // reorder within ungrouped is a no-op (live order rules)
        this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, payload.itemId, UNGROUPED_ID);
        this.persist();
        return;
      }
      // Insert before this row; same-group downward moves shift by one after removal.
      let to = memberIndex;
      if (payload.fromGroupId === group.id && payload.fromIndex < memberIndex) to -= 1;
      if (payload.fromGroupId === group.id && payload.fromIndex === to) return;
      this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, payload.itemId, group.id, to);
      this.persist();
    });
    return row;
  }

  private startRename(nameEl: HTMLElement, group: RibbonGroup): void {
    const input = createEl("input", { cls: "ribbon-organizer-rg-rename", attr: { type: "text" } });
    input.value = group.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.value = group.name;
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const name = input.value.trim();
      if (name !== "" && name !== group.name) {
        this.plugin.settings.groups = renameGroup(this.plugin.settings.groups, group.id, name);
      }
      this.persist(); // re-render restores the name span even when unchanged
    });
  }

  private onDragStart(e: DragEvent, payload: DragPayload): void {
    this.drag = payload;
    e.dataTransfer?.setData("text/plain", ""); // some platforms refuse to start a drag without data
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  private wireDropTarget(el: HTMLElement, onDrop: (payload: DragPayload) => void): void {
    el.addEventListener("dragover", (e) => {
      if (this.drag === null) return;
      e.preventDefault();
      el.addClass("is-drop-target");
    });
    el.addEventListener("dragleave", () => el.removeClass("is-drop-target"));
    el.addEventListener("dragend", () => {
      this.drag = null;
      el.removeClass("is-drop-target");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.removeClass("is-drop-target");
      const payload = this.drag;
      this.drag = null;
      if (payload !== null) onDrop(payload);
    });
  }

  private persist(): void {
    void (async () => {
      await this.plugin.saveSettings();
      this.plugin.applyGrouping();
      this.refresh();
    })();
  }
}
```

- [ ] **Step 2: Mount the section in `src/ui/SettingTab.ts`**

Add the import and field, and call `render` at the top of `display()`:

```ts
import { GroupsSection } from "./GroupsSection";
```

```ts
export class RibbonOrganizerSettingTab extends PluginSettingTab {
  private groupsSection: GroupsSection;

  constructor(app: App, private plugin: RibbonOrganizerPlugin) {
    super(app, plugin);
    this.groupsSection = new GroupsSection(app, plugin, () => {
      const scroll = this.containerEl.scrollTop;
      this.display();
      this.containerEl.scrollTop = scroll;
    });
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.groupsSection.render(containerEl);
    new Setting(containerEl)
      .setName("Quick commands")
      // …everything below is unchanged 0.1.1 code…
```

- [ ] **Step 3: Append settings CSS to `styles.css`**

```css
/* Ribbon groups settings */
.ribbon-organizer-rg-filter { width: 100%; margin-bottom: 8px; }
.ribbon-organizer-rg-list { display: flex; flex-direction: column; border: 1px solid var(--background-modifier-border);
  border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
.ribbon-organizer-rg-hdr { display: flex; align-items: center; gap: 8px; padding: 7px 10px; font-weight: 600;
  background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border); }
.ribbon-organizer-rg-hdr:first-child { border-top: none; }
.ribbon-organizer-rg-item { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 24px;
  border-top: 1px solid var(--background-modifier-border); }
.ribbon-organizer-rg-item.is-missing { opacity: 0.55; }
.ribbon-organizer-rg-item.is-filtered-out { display: none; }
.ribbon-organizer-rg-grip { display: inline-flex; color: var(--text-faint); cursor: grab; --icon-size: 14px; }
.ribbon-organizer-rg-icon { display: inline-flex; --icon-size: 16px; }
.ribbon-organizer-rg-icon .svg-icon { flex: none; }
.ribbon-organizer-rg-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ribbon-organizer-rg-plugin { margin-left: auto; font-size: var(--font-ui-smaller); color: var(--text-faint); }
.ribbon-organizer-rg-missing { font-size: var(--font-ui-smaller); color: var(--text-faint); }
.ribbon-organizer-rg-badge { margin-left: 4px; padding: 1px 7px; border-radius: 8px;
  font-size: var(--font-ui-smaller); color: var(--text-muted); background: var(--background-modifier-border); }
.ribbon-organizer-rg-hdr .ribbon-organizer-rg-btns { margin-left: auto; }
.ribbon-organizer-rg-btns { flex: none; display: flex; gap: 2px; }
.ribbon-organizer-rg-rename { font-weight: 600; }
.ribbon-organizer-rg-addbar { display: flex; gap: 8px; margin-bottom: 18px; }
.ribbon-organizer-rg-note { color: var(--text-faint); margin-bottom: 18px; }
.ribbon-organizer-rg-hdr.is-drop-target, .ribbon-organizer-rg-item.is-drop-target {
  box-shadow: inset 0 2px 0 var(--interactive-accent); }
```

- [ ] **Step 4: Gates**

Run: `npm test` → all pass. Run: `npm run build` → exits 0.
Run: `npm run lint` → 0 problems.
  - Contingency: `GroupsSection.ts` builds a custom interactive list (drag-and-drop, inline rename) that the declarative `getSettingDefinitions` API cannot express — if `obsidianmd/settings-tab/prefer-setting-definitions` fires on it, add `'src/ui/GroupsSection.ts'` to the existing scoped-off `files` array in `eslint.config.mts` and extend that block's rationale comment. No inline disables.
Do NOT commit.

---

### Task 4: Docs + version bump

**Files:**
- Modify: `README.md`
- Modify: `package.json`, `manifest.json`, `versions.json` (via the version script)

**Interfaces:** none (docs/metadata only).

- [ ] **Step 1: Update `README.md`**

Replace the intro paragraph and roadmap line:

```markdown
# Ribbon Organizer

An [Obsidian](https://obsidian.md) plugin that organizes the left ribbon and launches your commands from a configurable ribbon menu.

- **Ribbon groups** (desktop): order the ribbon icons into named groups from **Settings → Ribbon Organizer** — drag icons between groups, drag groups to reorder. A thin divider line renders between adjacent non-empty groups. Icons you haven't assigned fall into the ungrouped bucket, so newly installed plugins land in a predictable spot. Visibility stays native: hide/unhide icons via Obsidian's right-click as usual.
- **Quick commands**: pick any commands, give them labels and icons (including [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) custom-pack icons), group them with separators. A command not installed on the current device is greyed out and recovers automatically once its plugin is installed.

Configuration lives in the plugin's `data.json`, so it follows whatever vault sync you use.
```

(Keep the Install and License sections unchanged.)

- [ ] **Step 2: Bump the version to 0.2.0**

Run: `npm version 0.2.0 --no-git-tag-version`
Expected: `v0.2.0`; `package.json`, `manifest.json`, `versions.json` now carry 0.2.0 (the `version` lifecycle script runs `version-bump.mjs` and stages the two JSON files — staging is fine, committing is not).
Verify: `grep '"version"' package.json manifest.json` → both `0.2.0`.

- [ ] **Step 3: Final gates**

Run: `npm run lint` → 0 problems. `npm test` → all pass. `npm run build` → exits 0.
Run: `npm run smoke:install` → copies `main.js`/`manifest.json`/`styles.css` into `dev/vault/.obsidian/plugins/ribbon-organizer/`.
Do NOT commit, tag, or release — the 0.2.0 cut happens on the owner's explicit go after live verification.

---

## Live verification (owner + coordinator, after all tasks)

Dev vault first, then the main vault. Not implementer steps — listed so nothing is forgotten:

1. Grouping applies on startup and re-applies after a late-loading plugin adds an icon.
2. Native right-click hide/unhide re-flows dividers (a group going all-hidden loses its divider).
3. Disabling the plugin restores the stock ribbon (no orders, no dividers).
4. Settings: drag within/across groups, drag group headers (sentinel too), `⋮` move, filter, inline rename (Enter/Escape/blur), delete group → members reappear under Ungrouped, stale item shows "Not on this device".
5. macOS + at least one non-default theme; ribbon divider spacing looks right (tune `.ribbon-organizer-divider` margin if not).
6. After the owner rebuilds their groups in the main vault: delete `mystyle-ribbon.css` from the vault snippets (outside this repo).
