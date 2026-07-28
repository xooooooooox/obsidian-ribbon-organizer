# Status Bar Ordering + Mobile Display Implementation Plan (0.9.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "Status bar" settings tab that drag-reorders the status bar items (one order shared across devices, applied via per-item inline flex `order`) and an opt-in toggle that shows the status bar on phones/tablets as a floating pill.

**Architecture:** A pure core module (`src/core/statusBarItems.ts`) derives item identities from DOM class lists (`key#index`) and computes orders/row sequences; `src/main.ts` applies inline `order` values guarded by a childList-only MutationObserver and toggles a body class for the mobile pill; `src/ui/StatusBarSection.ts` renders the third settings tab. The pill styling ships statically in `styles.css`, gated on the body class.

**Tech Stack:** TypeScript, esbuild, vitest, eslint-plugin-obsidianmd preset.

Spec: `docs/superpowers/specs/2026-07-28-statusbar-order-and-mobile-design.md`

## Global Constraints

- **NO GIT COMMITS.** Leave all changes uncommitted (repo convention: the working tree is the user's review state). Never add Claude/AI attribution anywhere.
- Gates after each task: `npm run build` (clean), `npm test` (44 existing tests stay green; Task 1 adds its own), `npm run lint` (**0 problems** — repo baseline).
- Lint preset forbids ALL inline `eslint-disable` comments. Fix code, never disable.
- Strict typing; `unknown` only at boundaries, narrowed immediately (match the existing `ribbonInternals`/`cmdrAccess` cast idiom in `src/main.ts`).
- Copy is final (from the approved mockup) — use these strings verbatim:
  - Tab label `Status bar`, icon `panel-bottom`.
  - Toggle name `Show on phones and tablets`; desc `Obsidian normally hides the status bar on mobile. Turn this on to float it above the toolbar; it slides away while you scroll or type.`
  - List desc `Drag to reorder the status bar. The same order applies on every device; items a device doesn't have are skipped there.`
  - Missing row tag `Not on this device`; footer hint `New items appear at the end.`
  - Incompatibility note `Status bar ordering is incompatible with this Obsidian version.`; Notice `Ribbon Organizer: status bar ordering is incompatible with this Obsidian version.`
- Body class: `ribbon-organizer-mobile-sb`. CSS gap knob: `--ribbon-organizer-sb-gap` (32px default). No `safe-area-inset-bottom` anywhere in the pill block (double-counts the navbar box).
- `statusBarOrder: []` ⇒ `applyStatusBarOrder()` is a strict no-op (fresh installs keep a byte-for-byte native bar).
- `README.md` and `README.zh.md` must keep **equal line counts** (currently 55/55) — every addition lands in both files with the same line span.
- Version bump/tag/release are NOT part of this plan (the user triggers the cut separately).

---

### Task 1: Core identity + order module

**Files:**
- Create: `src/core/statusBarItems.ts`
- Test: `tests/statusBarItems.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (Tasks 2–3 rely on these exact signatures):
  - `statusBarItemKey(classes: string[]): string`
  - `deriveStatusBarIds(classLists: string[][]): string[]`
  - `splitStatusBarId(id: string): { key: string; index: number }`
  - `computeStatusBarOrder(stored: string[], live: string[]): Map<string, number>`
  - `statusBarRowIds(stored: string[], live: string[]): string[]`
  - `normalizeStatusBarOrder(raw: unknown): string[]`
  - `fallbackItemName(key: string): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/statusBarItems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeStatusBarOrder,
  deriveStatusBarIds,
  fallbackItemName,
  normalizeStatusBarOrder,
  splitStatusBarId,
  statusBarItemKey,
  statusBarRowIds,
} from "../src/core/statusBarItems";

describe("statusBarItemKey", () => {
  it("uses the plugin- class and ignores every other class", () => {
    expect(statusBarItemKey(["status-bar-item", "plugin-obsidian-git", "mod-clickable"])).toBe("obsidian-git");
    // state classes churn at runtime and must not affect identity
    expect(statusBarItemKey(["plugin-config-sync", "config-sync-statusbar", "mod-clickable", "is-clean"])).toBe("config-sync");
  });

  it("falls back to the sorted non-generic classes joined with +", () => {
    expect(statusBarItemKey(["cmdr", "status-bar-item", "cmdr-adder"])).toBe("cmdr+cmdr-adder");
    expect(statusBarItemKey(["status-bar-item", "left-region"])).toBe("left-region");
  });

  it("keys a bare item as \"item\"", () => {
    expect(statusBarItemKey(["status-bar-item", "mod-clickable"])).toBe("item");
    expect(statusBarItemKey([])).toBe("item");
  });
});

describe("deriveStatusBarIds", () => {
  it("numbers same-key items by DOM occurrence, 0-based", () => {
    const ids = deriveStatusBarIds([
      ["status-bar-item", "plugin-obsidian-git"],
      ["status-bar-item", "plugin-word-count"],
      ["status-bar-item", "plugin-obsidian-git", "mod-clickable"],
    ]);
    expect(ids).toEqual(["obsidian-git#0", "word-count#0", "obsidian-git#1"]);
  });

  it("returns one id per input in input order", () => {
    expect(deriveStatusBarIds([])).toEqual([]);
    expect(deriveStatusBarIds([["status-bar-item"], ["status-bar-item"]])).toEqual(["item#0", "item#1"]);
  });
});

describe("splitStatusBarId", () => {
  it("splits key and index at the last #", () => {
    expect(splitStatusBarId("obsidian-git#1")).toEqual({ key: "obsidian-git", index: 1 });
    expect(splitStatusBarId("cmdr+cmdr-adder#0")).toEqual({ key: "cmdr+cmdr-adder", index: 0 });
  });

  it("treats a malformed id as index 0", () => {
    expect(splitStatusBarId("no-hash")).toEqual({ key: "no-hash", index: 0 });
    expect(splitStatusBarId("bad#x")).toEqual({ key: "bad", index: 0 });
  });
});

describe("computeStatusBarOrder", () => {
  it("orders stored ids first, then appends unknown live ids in live order", () => {
    const orders = computeStatusBarOrder(["b#0", "a#0"], ["a#0", "b#0", "c#0", "d#0"]);
    const sorted = [...orders.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(sorted).toEqual(["b#0", "a#0", "c#0", "d#0"]);
  });

  it("skips stored ids absent from live but emits an entry for every live id", () => {
    const orders = computeStatusBarOrder(["gone#0", "a#0"], ["a#0", "new#0"]);
    expect(orders.has("gone#0")).toBe(false);
    expect(orders.size).toBe(2);
  });

  it("assigns strictly increasing values starting at 1", () => {
    const orders = computeStatusBarOrder(["a#0"], ["a#0", "b#0"]);
    expect(orders.get("a#0")).toBe(1);
    expect(orders.get("b#0")).toBe(2);
  });
});

describe("statusBarRowIds", () => {
  it("keeps absent stored ids in place and appends new live ids", () => {
    expect(statusBarRowIds(["desk-only#0", "a#0"], ["a#0", "b#0"])).toEqual(["desk-only#0", "a#0", "b#0"]);
  });

  it("returns live order when nothing is stored", () => {
    expect(statusBarRowIds([], ["a#0", "b#0"])).toEqual(["a#0", "b#0"]);
  });
});

describe("normalizeStatusBarOrder", () => {
  it("returns [] for a non-array", () => {
    expect(normalizeStatusBarOrder(undefined)).toEqual([]);
    expect(normalizeStatusBarOrder({ a: 1 })).toEqual([]);
  });

  it("drops non-strings and duplicates, first wins", () => {
    expect(normalizeStatusBarOrder(["a#0", 3, "b#0", "a#0", null])).toEqual(["a#0", "b#0"]);
  });
});

describe("fallbackItemName", () => {
  it("prettifies a simple key", () => {
    expect(fallbackItemName("word-count")).toBe("Word count");
    expect(fallbackItemName("left-region")).toBe("Left region");
  });

  it("uses the most specific (longest) class of a joined key", () => {
    expect(fallbackItemName("cmdr+cmdr-adder")).toBe("Cmdr adder");
  });

  it("never returns an empty name", () => {
    expect(fallbackItemName("")).toBe("Item");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/statusBarItems.test.ts`
Expected: FAIL — cannot resolve `../src/core/statusBarItems`.

- [ ] **Step 3: Write the module**

Create `src/core/statusBarItems.ts`:

```ts
const GENERIC_CLASSES = new Set(["status-bar-item", "mod-clickable"]);

// Identity key for one status bar item, derived from its DOM class list. There is no
// registry like leftRibbon.items (app.statusBar is just { app, containerEl }), so classes
// are the only stable handle. A `plugin-<id>` class wins and every other class is ignored
// (state classes like `is-clean` churn at runtime and must never move an item's identity);
// otherwise the remaining non-generic classes, sorted and joined with "+", identify
// core/injected items (observed: "cmdr+cmdr-adder", "left-region").
export function statusBarItemKey(classes: string[]): string {
  const pluginClass = classes.find((c) => c.startsWith("plugin-"));
  if (pluginClass !== undefined) return pluginClass.slice("plugin-".length);
  const rest = classes.filter((c) => !GENERIC_CLASSES.has(c)).sort();
  return rest.length === 0 ? "item" : rest.join("+");
}

// Ids for the live items in DOM order: key + "#" + 0-based occurrence among same-key items.
// Accepted limitation (spec): a plugin creating multiple items in unstable order can swap
// its own items' slots — the index is the only cross-session handle available.
export function deriveStatusBarIds(classLists: string[][]): string[] {
  const seen = new Map<string, number>();
  return classLists.map((classes) => {
    const key = statusBarItemKey(classes);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}#${String(n)}`;
  });
}

// CSS class names cannot contain "#", so the last "#" always separates key from index.
export function splitStatusBarId(id: string): { key: string; index: number } {
  const at = id.lastIndexOf("#");
  if (at === -1) return { key: id, index: 0 };
  const index = Number(id.slice(at + 1));
  return { key: id.slice(0, at), index: Number.isInteger(index) && index >= 0 ? index : 0 };
}

// Flex order per live id: stored ids first (ids absent from live are skipped — the CALLER
// keeps them in the stored array), then live ids missing from stored, in live order.
export function computeStatusBarOrder(stored: string[], live: string[]): Map<string, number> {
  const liveSet = new Set(live);
  const orders = new Map<string, number>();
  let next = 1;
  for (const id of stored) {
    if (liveSet.has(id) && !orders.has(id)) orders.set(id, next++);
  }
  for (const id of live) {
    if (!orders.has(id)) orders.set(id, next++);
  }
  return orders;
}

// Settings-list row sequence: the stored order with absent ids kept in place (they render
// as "Not on this device" and must survive a drag on another device), then new live ids.
// Persisting a drag writes this sequence back verbatim.
export function statusBarRowIds(stored: string[], live: string[]): string[] {
  const storedSet = new Set(stored);
  return [...stored, ...live.filter((id) => !storedSet.has(id))];
}

// Repairs a stored statusBarOrder (data.json is hand-editable): non-array becomes [],
// non-strings and duplicates are dropped (first wins).
export function normalizeStatusBarOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && !out.includes(entry)) out.push(entry);
  }
  return out;
}

// Display name when no plugin manifest matches the key (core items, injected elements):
// the most specific (longest) class of a joined key, dashes to spaces, capitalized.
export function fallbackItemName(key: string): string {
  const longest = key.split("+").reduce((a, b) => (b.length > a.length ? b : a), "");
  const words = longest.replace(/-/g, " ").trim();
  return words === "" ? "Item" : words.charAt(0).toUpperCase() + words.slice(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/statusBarItems.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 61 tests passed (6 files); lint 0 problems.

---

### Task 2: Runtime wiring in main.ts

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes (Task 1): `computeStatusBarOrder`, `deriveStatusBarIds`, `normalizeStatusBarOrder`.
- Produces (Task 3 relies on these):
  - `settings.statusBarOrder: string[]` and `settings.statusBarShowOnMobile: boolean` on `RibbonOrganizerSettings`
  - `statusBarSnapshot(): StatusBarSnapshotItem[] | null` where `export interface StatusBarSnapshotItem { id: string; text: string }`
  - `applyStatusBarOrder(): void`
  - `applyMobileStatusBarClass(): void`

- [ ] **Step 1: Settings fields + load**

In `src/main.ts`, extend the settings interface and defaults:

```ts
interface RibbonOrganizerSettings {
  menus: QuickMenu[];             // user-defined ribbon menus: one composite ribbon icon each
  groups: RibbonGroup[];          // top-to-bottom ribbon group order (includes the ungrouped sentinel)
  statusBarOrder: string[];       // status bar item ids, left-to-right; [] = never reordered, bar stays native
  statusBarShowOnMobile: boolean; // floating pill on phones/tablets (styles.css, body-class gated)
}
```

Add to the import from `./core/statusBarItems`:

```ts
import { computeStatusBarOrder, deriveStatusBarIds, normalizeStatusBarOrder } from "./core/statusBarItems";
```

Update the field initializer and `loadSettings()`:

```ts
  settings: RibbonOrganizerSettings = { menus: defaultMenus(), groups: defaultGroups(), statusBarOrder: [], statusBarShowOnMobile: false };
```

```ts
  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as {
      menus?: unknown;
      quickCommands?: unknown;
      groups?: unknown;
      statusBarOrder?: unknown;
      statusBarShowOnMobile?: unknown;
    };
    this.settings = {
      menus: normalizeMenus(raw.menus, raw.quickCommands), // pre-0.4.0 quickCommands migrates to one menu
      groups: normalizeGroups(raw.groups ?? defaultGroups()),
      statusBarOrder: normalizeStatusBarOrder(raw.statusBarOrder),
      statusBarShowOnMobile: raw.statusBarShowOnMobile === true,
    };
  }
```

- [ ] **Step 2: Container accessor, snapshot, apply, observer, body class**

Below `ribbonInternals`, add the module-level accessor:

```ts
// Undocumented internal: app.statusBar carries only { app, containerEl } — there is no item
// registry, so identity is derived from each element's class list (see core/statusBarItems).
function statusBarContainer(app: App): HTMLElement | null {
  const bar = (app as unknown as { statusBar?: { containerEl?: unknown } }).statusBar;
  return bar !== undefined && bar !== null && bar.containerEl instanceof HTMLElement ? bar.containerEl : null;
}
```

Export the snapshot row type next to `RibbonSnapshotItem`:

```ts
// A live status bar item as exposed to the settings UI: derived id + current text preview.
export interface StatusBarSnapshotItem {
  id: string;
  text: string;
}
```

Add plugin fields below `private lastMenuOutcome = "not-run";`:

```ts
  private statusBarObserver: MutationObserver | null = null;
  private statusBarDisabled = false;
```

Add these methods to the plugin class:

```ts
  // Live .status-bar-item elements in DOM order with their derived ids; null (once per
  // session, with a Notice) when app.statusBar no longer matches the expected shape.
  private liveStatusBarItems(): { id: string; el: HTMLElement }[] | null {
    if (this.statusBarDisabled) return null;
    const container = statusBarContainer(this.app);
    if (container === null) {
      this.statusBarDisabled = true;
      console.error("Ribbon Organizer: app.statusBar does not match the expected shape; status bar ordering is disabled for this session");
      new Notice("Ribbon Organizer: status bar ordering is incompatible with this Obsidian version.");
      return null;
    }
    const els = Array.from(container.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("status-bar-item")
    );
    const ids = deriveStatusBarIds(els.map((el) => Array.from(el.classList)));
    const out: { id: string; el: HTMLElement }[] = [];
    els.forEach((el, i) => {
      const id = ids[i];
      if (id !== undefined) out.push({ id, el });
    });
    return out;
  }

  // The settings UI's view of the live status bar (text = collapsed textContent preview).
  statusBarSnapshot(): StatusBarSnapshotItem[] | null {
    const live = this.liveStatusBarItems();
    if (live === null) return null;
    return live.map(({ id, el }) => ({ id, text: (el.textContent ?? "").replace(/\s+/g, " ").trim() }));
  }

  // Applies the stored order as inline flex order values. Strict no-op while statusBarOrder
  // is [] (fresh installs keep a byte-for-byte native bar; a drag always persists the full
  // row sequence, so the array never returns to [] afterwards). Idempotent.
  applyStatusBarOrder(): void {
    if (this.settings.statusBarOrder.length === 0) return;
    const live = this.liveStatusBarItems();
    if (live === null) return;
    this.statusBarObserver?.disconnect();
    const orders = computeStatusBarOrder(this.settings.statusBarOrder, live.map((i) => i.id));
    for (const { id, el } of live) {
      const order = orders.get(id);
      el.setCssStyles({ order: order === undefined ? "" : String(order) });
    }
    const container = statusBarContainer(this.app);
    if (container !== null) this.observeStatusBar(container);
  }

  // Re-applies when items are added/removed (late-loading plugins, plugins rebuilding their
  // items). childList only, no subtree: the high-frequency text churn inside items (word
  // count, git status) never fires this. Disconnected while applying, like observeRibbon.
  private observeStatusBar(container: HTMLElement): void {
    if (this.statusBarObserver === null) {
      this.statusBarObserver = new MutationObserver(() => this.applyStatusBarOrder());
    }
    this.statusBarObserver.observe(container, { childList: true });
  }

  // The mobile pill styles in styles.css are gated on this body class; desktop never gets
  // it even when the synced setting is on.
  applyMobileStatusBarClass(): void {
    document.body.toggleClass("ribbon-organizer-mobile-sb", Platform.isMobile && this.settings.statusBarShowOnMobile);
  }
```

- [ ] **Step 3: Lifecycle wiring**

In `onload()`, add `this.applyMobileStatusBarClass();` right after `this.syncRibbonMenus();`, and extend the `onLayoutReady` callback:

```ts
    this.app.workspace.onLayoutReady(() => {
      this.applyGrouping();
      this.applyStatusBarOrder();
      this.observeMenus();
    });
```

In `onunload()`, add after the menu-observer teardown (before the `ribbonInternals` block):

```ts
    this.statusBarObserver?.disconnect();
    this.statusBarObserver = null;
    document.body.removeClass("ribbon-organizer-mobile-sb");
    const sbContainer = statusBarContainer(this.app);
    if (sbContainer !== null) {
      for (const el of Array.from(sbContainer.children)) {
        if (el instanceof HTMLElement && el.classList.contains("status-bar-item")) el.setCssStyles({ order: "" });
      }
    }
```

- [ ] **Step 4: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 61 passed; lint 0 problems.

- [ ] **Step 5: Dev-vault smoke (ordering runtime, no UI yet)**

```bash
npm run smoke:install
obsidian-cli app:reload
sleep 12
```

Then verify apply + no-op semantics (settings are runtime-only here — do NOT call saveSettings, so data.json stays clean):

```bash
obsidian-cli eval code="const p = app.plugins.plugins['ribbon-organizer']; const items = Array.from(document.querySelectorAll('.status-bar .status-bar-item')); JSON.stringify({ noopBefore: items.every(e => e.style.order === ''), count: items.length })"
```

Expected: `noopBefore: true` (empty order ⇒ untouched bar).

```bash
obsidian-cli eval code="const p = app.plugins.plugins['ribbon-organizer']; const snap = p.statusBarSnapshot(); p.settings.statusBarOrder = snap.map(i => i.id).reverse(); p.applyStatusBarOrder(); const items = Array.from(document.querySelectorAll('.status-bar .status-bar-item')); JSON.stringify({ ids: snap.length, ordered: items.filter(e => e.style.order !== '').length })"
```

Expected: `ordered` equals `ids` (every live item got an inline order; visually the bar reverses).

Reset without persisting: `obsidian-cli app:reload` (data.json was never written; reload restores the native bar).

---

### Task 3: Status bar settings tab

**Files:**
- Create: `src/ui/StatusBarSection.ts`
- Modify: `src/ui/SettingTab.ts`
- Modify: `styles.css` (settings styles; append after the `.is-phone` block)

**Interfaces:**
- Consumes (Task 1): `fallbackItemName`, `splitStatusBarId`, `statusBarRowIds`. (Task 2): `plugin.statusBarSnapshot()`, `plugin.applyStatusBarOrder()`, `plugin.applyMobileStatusBarClass()`, `plugin.settings.statusBarOrder`, `plugin.settings.statusBarShowOnMobile`, `StatusBarSnapshotItem`.
- Produces: `StatusBarSection` with `render(containerEl: HTMLElement): void` (consumed by SettingTab only).

- [ ] **Step 1: Create `src/ui/StatusBarSection.ts`**

```ts
import { App, Setting, setIcon } from "obsidian";
import { fallbackItemName, splitStatusBarId, statusBarRowIds } from "../core/statusBarItems";
import { withScrollPreserved } from "./scrollKeep";
import type RibbonOrganizerPlugin from "../main";
import type { StatusBarSnapshotItem } from "../main";

// "Status bar" settings tab: a mobile-display toggle plus a flat drag list mirroring the
// status bar's final order. One order shared across devices: rows for ids this device
// doesn't have stay in place ("Not on this device") so a drag here never evicts them.
export class StatusBarSection {
  private drag: string | null = null; // dragged row id
  private containerEl: HTMLElement | null = null;

  constructor(
    private app: App,
    private plugin: RibbonOrganizerPlugin
  ) {}

  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    withScrollPreserved(containerEl, () => this.renderContent(containerEl));
  }

  private renderContent(containerEl: HTMLElement): void {
    containerEl.empty();
    new Setting(containerEl)
      .setName("Show on phones and tablets")
      .setDesc("Obsidian normally hides the status bar on mobile. Turn this on to float it above the toolbar; it slides away while you scroll or type.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.statusBarShowOnMobile).onChange((value) => {
          this.plugin.settings.statusBarShowOnMobile = value;
          void this.plugin.saveSettings().then(() => this.plugin.applyMobileStatusBarClass());
        })
      );

    containerEl.createDiv({
      cls: "ribbon-organizer-tab-desc",
      text: "Drag to reorder the status bar. The same order applies on every device; items a device doesn't have are skipped there.",
    });

    const snapshot = this.plugin.statusBarSnapshot();
    if (snapshot === null) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Status bar ordering is incompatible with this Obsidian version." });
      return;
    }
    const liveById = new Map(snapshot.map((i) => [i.id, i]));
    const rowIds = statusBarRowIds(this.plugin.settings.statusBarOrder, snapshot.map((i) => i.id));
    // Rows sharing a key need an ordinal so two "Git" rows stay tellable apart.
    const keyCounts = new Map<string, number>();
    for (const id of rowIds) {
      const { key } = splitStatusBarId(id);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-sb-list" });
    rowIds.forEach((id) => this.renderRow(listEl, id, rowIds, liveById.get(id), keyCounts));

    // The hint doubles as the append drop target — insert-before alone cannot reach the end.
    const hint = containerEl.createDiv({ cls: "ribbon-organizer-sb-hint", text: "New items appear at the end." });
    this.wireDrop(hint, (draggedId) => {
      const out = rowIds.filter((r) => r !== draggedId);
      out.push(draggedId);
      this.persist(out);
    });
  }

  private renderRow(
    listEl: HTMLElement,
    id: string,
    rowIds: string[],
    live: StatusBarSnapshotItem | undefined,
    keyCounts: Map<string, number>
  ): void {
    const { key, index } = splitStatusBarId(id);
    const row = listEl.createDiv({ cls: "ribbon-organizer-sb-item", attr: { draggable: "true" } });
    if (live === undefined) row.addClass("is-missing");
    const grip = row.createSpan({ cls: "ribbon-organizer-rg-grip" });
    setIcon(grip, live === undefined ? "help" : "grip-vertical");
    const title = row.createSpan({ cls: "ribbon-organizer-sb-title", text: this.displayName(key) });
    if ((keyCounts.get(key) ?? 0) > 1) title.createSpan({ cls: "ribbon-organizer-sb-ordinal", text: ` · ${String(index + 1)}` });
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-sb-missing", text: "Not on this device" });
    else if (live.text !== "") row.createSpan({ cls: "ribbon-organizer-sb-preview", text: live.text });
    row.createSpan({ cls: "ribbon-organizer-rg-plugin", text: key });

    row.addEventListener("dragstart", (e) => {
      this.drag = id;
      e.dataTransfer?.setData("text/plain", ""); // some platforms refuse to start a drag without data
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    this.wireDrop(row, (draggedId) => {
      if (draggedId === id) return;
      const out = rowIds.filter((r) => r !== draggedId);
      const to = out.indexOf(id); // insert before the hovered row (indexOf is post-removal)
      if (to === -1) return;
      out.splice(to, 0, draggedId);
      this.persist(out);
    });
  }

  private displayName(key: string): string {
    const manifests = (this.app as unknown as { plugins?: { manifests?: Record<string, { name?: unknown }> } }).plugins?.manifests;
    const name = manifests?.[key]?.name;
    return typeof name === "string" ? name : fallbackItemName(key);
  }

  private wireDrop(el: HTMLElement, onDrop: (draggedId: string) => void): void {
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
      const draggedId = this.drag;
      this.drag = null;
      if (draggedId !== null) onDrop(draggedId);
    });
  }

  private persist(order: string[]): void {
    this.plugin.settings.statusBarOrder = order;
    void (async () => {
      await this.plugin.saveSettings();
      this.plugin.applyStatusBarOrder();
      if (this.containerEl !== null) this.render(this.containerEl);
    })();
  }
}
```

- [ ] **Step 2: Third tab in `src/ui/SettingTab.ts`**

```ts
import { StatusBarSection } from "./StatusBarSection";
```

```ts
type PanelTab = "groups" | "commands" | "statusbar";

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: "groups", label: "Ribbon", icon: "rows-3" },
  { id: "commands", label: "Quick menus", icon: "menu" },
  { id: "statusbar", label: "Status bar", icon: "panel-bottom" },
];
```

Add the field + constructor line:

```ts
  private statusBarSection: StatusBarSection;
```

```ts
    this.statusBarSection = new StatusBarSection(app, plugin);
```

Extend the declarative definition's `aliases` (keep existing entries):

```ts
        aliases: ["ribbon groups", "quick menus", "quick commands", "divider", "separator", "reorder", "menu", "hide", "status bar", "statusbar", "mobile status bar"],
```

Update the body dispatch at the end of `renderTabbed`:

```ts
    const body = containerEl.createDiv();
    if (this.activeTab === "groups") this.groupsSection.render(body);
    else if (this.activeTab === "commands") this.quickMenusSection.render(body);
    else this.statusBarSection.render(body);
```

- [ ] **Step 3: Settings styles in `styles.css`**

Append after the `.is-phone` block:

```css
/* ---------- Status bar tab ---------- */
.ribbon-organizer-sb-list { display: flex; flex-direction: column; border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m); overflow: hidden; }
.ribbon-organizer-sb-item { display: flex; align-items: center; gap: 8px; padding: 5px 10px;
  border-bottom: 1px solid var(--background-modifier-border); }
.ribbon-organizer-sb-item:last-child { border-bottom: none; }
.ribbon-organizer-sb-item.is-missing { opacity: 0.55; }
.ribbon-organizer-sb-item.is-drop-target { box-shadow: inset 0 2px 0 var(--interactive-accent); }
.ribbon-organizer-sb-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ribbon-organizer-sb-ordinal { color: var(--text-faint); font-size: var(--font-ui-smaller); }
.ribbon-organizer-sb-preview { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 40%; color: var(--text-faint); font-size: var(--font-ui-smaller); }
.ribbon-organizer-sb-missing { margin-left: auto; color: var(--text-faint); font-size: var(--font-ui-smaller); font-style: italic; }
/* chip owns the right edge only when neither preview nor missing-tag sits between */
.ribbon-organizer-sb-title + .ribbon-organizer-rg-plugin { margin-left: auto; }
.ribbon-organizer-sb-hint { margin-top: 8px; color: var(--text-faint); font-size: var(--font-ui-smaller); }
.ribbon-organizer-sb-hint.is-drop-target { box-shadow: inset 0 2px 0 var(--interactive-accent); }
.is-phone .ribbon-organizer-sb-item .ribbon-organizer-rg-plugin,
.is-phone .ribbon-organizer-sb-preview { display: none; }
```

- [ ] **Step 4: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 61 passed; lint 0 problems.

- [ ] **Step 5: Dev-vault smoke (tab + rows)**

```bash
npm run smoke:install
obsidian-cli app:reload
sleep 12
obsidian-cli eval code="app.setting.open(); app.setting.openTabById('ribbon-organizer'); JSON.stringify(Array.from(document.querySelectorAll('.ribbon-organizer-tab')).map(t => t.textContent))"
```

Expected: `["Ribbon","Quick menus","Status bar"]`.

```bash
obsidian-cli eval code="Array.from(document.querySelectorAll('.ribbon-organizer-tab')).find(t => t.textContent === 'Status bar').click(); const rows = document.querySelectorAll('.ribbon-organizer-sb-item'); const live = document.querySelectorAll('.status-bar .status-bar-item'); JSON.stringify({ rows: rows.length, live: live.length, firstTitle: rows[0]?.querySelector('.ribbon-organizer-sb-title')?.textContent })"
```

Expected: `rows` equals `live`; `firstTitle` is a human name (e.g. a plugin's display name, not a raw id). Close settings afterwards: `obsidian-cli eval code="app.setting.close()"`.

Drag-and-drop itself is manual-only (HTML5 drag events don't synthesize reliably) — covered by the real-device/manual checklist at the end.

---

### Task 4: Mobile pill CSS + docs

**Files:**
- Modify: `styles.css` (append the pill block at the end)
- Modify: `README.md`, `README.zh.md` (equal line counts, currently 55/55)
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes (Task 2): the `ribbon-organizer-mobile-sb` body class contract.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Pill block in `styles.css`**

Append at the end of the file:

```css
/* ============================================================
 * Mobile status bar pill — gated on body.ribbon-organizer-mobile-sb,
 * added by main.ts only when Platform.isMobile AND the "Show on
 * phones and tablets" toggle is on. A floating pill above the navbar
 * that behaves like native bottom chrome: hides while scrolling
 * (.is-hidden-nav) and while typing (.cm-focused), floats back idle.
 *
 * Clearance = Obsidian's live --mobile-toolbar-height + a gap. The
 * navbar box already covers the home-indicator safe area, so NO
 * safe-area-inset-bottom here — adding it double-counts and lifts the
 * pill too high. --ribbon-organizer-sb-gap is the only knob
 * (overridable from a user snippet; deliberately not a setting).
 * ============================================================ */
body.ribbon-organizer-mobile-sb.is-mobile {
  --ribbon-organizer-sb-gap: 32px;
  --ribbon-organizer-sb-bottom: calc(var(--mobile-toolbar-height, 52px) + var(--ribbon-organizer-sb-gap, 32px));
}
body.ribbon-organizer-mobile-sb.is-mobile .status-bar {
  display: flex !important;        /* core hides the bar on mobile */
  margin-bottom: 0 !important;     /* cancel Remotely Save's injected lift */
  position: fixed;                 /* theme compat: some themes switch it to absolute */
  left: auto;
  right: var(--size-4-3, 12px);
  bottom: var(--ribbon-organizer-sb-bottom);
  max-width: calc(100vw - 2 * var(--size-4-3, 12px));
  flex-wrap: wrap;                 /* any number of items */
  justify-content: flex-end;
  align-items: center;
  transform: none !important;      /* theme compat: cancel hover slide-offs (AnuPpuccin) */
  border-radius: var(--radius-m);
  border: 1px solid var(--background-modifier-border);
  /* fully opaque: solid base + surface tint (theme surfaces can carry alpha) */
  background-color: var(--background-primary);
  background-image: linear-gradient(var(--background-secondary), var(--background-secondary));
  box-shadow: var(--shadow-s);
  transition: transform 0.3s ease-out, opacity 0.2s ease-in-out; /* match the navbar */
}
/* Hide with the navbar while scrolling, and while the keyboard is up */
body.ribbon-organizer-mobile-sb.is-mobile.is-hidden-nav .status-bar,
body.ribbon-organizer-mobile-sb.is-mobile:has(.cm-editor.cm-focused) .status-bar {
  transform: translateY(calc(100% + var(--ribbon-organizer-sb-bottom, 80px))) !important;
  opacity: 0;
}
/* Theme compat: AnuPpuccin's floating variant adds a hover hit-area pseudo-element */
body.ribbon-organizer-mobile-sb.anp-floating-status-bar .status-bar::before { content: none !important; }
/* One line per item; truncate long ones (e.g. sync timestamps) */
body.ribbon-organizer-mobile-sb.is-mobile .status-bar .status-bar-item {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60vw;
}
```

- [ ] **Step 2: README feature bullet + section (both languages, same line spans)**

`README.md` — in `## Features`, insert after the **Quick menus** bullet:

```markdown
- **Status bar** — drag the status bar items into your own order (one order shared across all devices), and optionally show the status bar on phones and tablets as a floating pill above the toolbar.
```

`README.md` — in `## How it works`, insert a new subsection between `### Hiding` and `### Quick menus`:

```markdown
### Status bar

The Status bar tab lists every status bar item; drag to reorder — the order applies live and on every device, and items a device doesn't have keep their place ("Not on this device"). Obsidian hides the status bar on mobile by default: the "Show on phones and tablets" toggle floats it above the toolbar, and it slides away while you scroll or type. Ordering applies wherever the bar is visible — the toggle, a theme, or your own CSS snippet. Items are recognized by their plugin; a plugin showing several items keeps them apart by position, which in rare cases can swap after an update of that plugin.
```

`README.zh.md` — in `## 功能特性`, insert after the Quick menus bullet (same position):

```markdown
- **状态栏** — 拖拽调整状态栏条目的顺序(所有设备共用一份顺序);还可选择在手机和平板上以浮动胶囊的形式显示状态栏。
```

`README.zh.md` — in `## 工作原理`, insert between the 隐藏 and Quick menus subsections:

```markdown
### 状态栏

「Status bar」标签页列出所有状态栏条目,拖拽即可排序——顺序即时生效并同步到所有设备,本设备没有的条目保留原位(显示「Not on this device」)。Obsidian 在移动端默认隐藏状态栏:打开「Show on phones and tablets」开关后,状态栏会浮动在工具栏上方,滚动或输入时自动滑出屏幕。排序作用于任何让状态栏可见的方式——该开关、主题或你自己的 CSS 代码片段。条目按所属插件识别;同一插件的多个条目按位置区分,极少数情况下在该插件更新后可能互换。
```

Verify parity: `wc -l README.md README.zh.md` — both files must report the same count (each gains the same number of lines: 1 bullet + the 4-line subsection).

- [ ] **Step 3: `docs/ARCHITECTURE.md` updates**

In `## Module map (src/)`, add to the core list (after the `ribbonGroups.ts` entry):

```markdown
- `core/statusBarItems.ts` — status bar item identity (`key#index` from DOM class lists; `plugin-<id>` class wins, state classes ignored), order computation (stored first, absent kept by the caller, new appended), row sequence for the settings list, `normalizeStatusBarOrder`, fallback display names. Pure.
```

And to the UI list (after the `GroupsSection.ts` entry):

```markdown
- `ui/StatusBarSection.ts` — the Status bar tab: mobile-display toggle + flat drag list (insert-before on rows, append via the footer hint). Self-contained drag code; GroupsSection's group semantics don't apply.
```

In `## Core invariants`, append:

```markdown
- Status bar identity is derived from DOM classes (`app.statusBar` has no item registry). Accepted limitation: a plugin creating several items in unstable order can swap its own items' slots; the escalation path (extra-class fingerprints) is documented in the 2026-07-28 spec, not built.
- `statusBarOrder: []` means "never touched": the apply pass is a strict no-op and the bar stays native. Orders are inline flex `order` values; unload clears them all.
- The mobile pill is pure CSS in `styles.css`, gated on `body.ribbon-organizer-mobile-sb`; main.ts toggles that class only when `Platform.isMobile` and `statusBarShowOnMobile` are both true.
```

In `## Data model`, add to the settings shape description:

```markdown
- `statusBarOrder: string[]` — status bar item ids (`key#index`), left-to-right; ids absent on this device stay in the array so a reorder never evicts another device's items.
- `statusBarShowOnMobile: boolean` — default false; the "Show on phones and tablets" toggle.
```

- [ ] **Step 4: Gates + final full check**

Run: `npm run build && npm test && npm run lint && wc -l README.md README.zh.md`
Expected: build clean; 61 passed; lint 0 problems; equal README line counts.

```bash
npm run smoke:install
obsidian-cli app:reload
sleep 12
obsidian-cli eval code="const p = app.plugins.plugins['ribbon-organizer']; JSON.stringify({ v: p.manifest.version, bodyClass: document.body.classList.contains('ribbon-organizer-mobile-sb'), showOnMobile: p.settings.statusBarShowOnMobile })"
```

Expected: `bodyClass: false` on desktop even after flipping the toggle on (flip it via the settings UI or eval `p.settings.statusBarShowOnMobile = true; p.applyMobileStatusBarClass()` — class must STAY false on desktop; reset afterwards).

---

## Manual / real-device checklist (not executable in this environment)

Desktop dev vault (manual): drag a row → bar reorders instantly and survives app reload; drag onto the footer hint → row lands last; two Git rows show `· 1` / `· 2`; late-enabling a plugin appends its item; disabling the plugin restores the native bar.

Phone (owner devices, after the cut): toggle on → pill floats above the navbar; order matches desktop minus absent items ("Not on this device" rows); pill hides while scrolling and while the keyboard is up; toggle off → bar hidden again. Owner vault: disable the `mystyle-mobile.css` snippet first — running both stacks conflicting `!important` rules.
