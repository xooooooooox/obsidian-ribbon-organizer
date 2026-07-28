# Status Bar Hide + Preview + Pinned-Item Fix Implementation Plan (0.10.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-item hide on the Status bar tab (asymmetric two-layer with Commander), a live preview (clone-based mini strip + three-way hover spotlight), and the pinned-item fix that stops inline `order` from overriding items that position themselves via their own CSS.

**Architecture:** The pure layer gains a pinned-aware order computation and a sibling-migration helper; `main.ts`'s apply pass grows a pinned probe (clear inline → read computed `order` → write) and a `display` write for the plugin's own hide layer, plus `setStatusBarItemHidden` encapsulating the Commander interplay; `StatusBarSection` renders eyes, lock rows, the clone strip, and hover wiring with explicit listener cleanup.

**Tech Stack:** TypeScript, esbuild, vitest, eslint-plugin-obsidianmd preset.

Spec: `docs/superpowers/specs/2026-07-28-statusbar-hide-and-preview-design.md`

## Global Constraints

- **NO GIT COMMITS.** Leave all changes uncommitted (repo convention: the working tree is the user's review state). Never add Claude/AI attribution anywhere.
- Gates after each task: `npm run build` (clean), `npm test` (65 after Task 1: 61 baseline − 0 removed + 4 new; Task 1 also updates 3 existing cases in place), `npm run lint` (**0 problems**). Preset forbids ALL inline eslint-disable comments; for real-DOM element checks use `.instanceOf(HTMLElement)` (house convention), not `instanceof`.
- Copy is final (from the approved mockup) — verbatim:
  - List desc: `Drag to reorder the status bar; the eye hides an item everywhere. The same order and visibility apply on every device; items a device doesn't have are skipped there.`
  - Eye tooltips: `Hide this item` / `Show this item`. Pinned tag: `Keeps its own position`. Strip label: `Preview · hover a row or an item to locate it`.
  - Commander-broken Notice: `Ribbon Organizer: Commander settings look unexpected — the item may stay hidden by Commander.`
- Hide writes ONLY `statusBarHidden` (own layer); show clears both layers and migrates the plugin's other live items into `statusBarHidden` before clearing Commander's plugin-level rule.
- Pinned = computed `order ≠ "0"` with the inline value cleared; pinned items NEVER receive an inline `order` (this heals the 0.9.x left-region bug on first apply, no data migration).
- `applyStatusBarOrder()` short-circuits only when `statusBarOrder` AND `statusBarHidden` are both empty; with only hides set it writes `display` and leaves every `order` untouched.
- Every selector of the styles.css mobile-pill block gains `:not(.ribbon-organizer-sb-strip)`; the strip must stay a plain in-panel element on all platforms.
- `README.md`/`README.zh.md` keep equal line counts (currently 60/60; this plan only replaces lines 1-for-1).
- Version bump/tag/release are NOT part of this plan (user-triggered cut).

---

### Task 1: Pure layer — pinned-aware order + sibling migration

**Files:**
- Modify: `src/core/statusBarItems.ts`
- Test: `tests/statusBarItems.test.ts`

**Interfaces:**
- Consumes: existing `splitStatusBarId`.
- Produces (Task 2 relies on these exact signatures):
  - `computeStatusBarOrder(stored: string[], live: string[], pinned: Set<string>): Map<string, number>` (signature change: new third parameter)
  - `cmdrHiddenSiblings(key: string, liveIds: string[], shownId: string): string[]`

- [ ] **Step 1: Update the three existing computeStatusBarOrder tests and add the new ones**

In `tests/statusBarItems.test.ts`, add `new Set<string>()` as the third argument to the three existing `computeStatusBarOrder(...)` calls inside `describe("computeStatusBarOrder", ...)` (their assertions are unchanged), then append after that describe block:

```ts
describe("computeStatusBarOrder with pinned", () => {
  it("emits no entry for pinned ids and keeps numbering contiguous for the rest", () => {
    const orders = computeStatusBarOrder(["a#0", "pin#0", "b#0"], ["pin#0", "a#0", "b#0"], new Set(["pin#0"]));
    expect(orders.has("pin#0")).toBe(false);
    expect(orders.get("a#0")).toBe(1);
    expect(orders.get("b#0")).toBe(2);
  });

  it("never assigns an order to a pinned id even when it is absent from stored", () => {
    const orders = computeStatusBarOrder(["a#0"], ["a#0", "pin#0"], new Set(["pin#0"]));
    expect(orders.size).toBe(1);
    expect(orders.get("a#0")).toBe(1);
  });
});

describe("cmdrHiddenSiblings", () => {
  it("returns the other live items sharing the plugin key", () => {
    expect(cmdrHiddenSiblings("obsidian-git", ["a#0", "obsidian-git#0", "obsidian-git#1"], "obsidian-git#0")).toEqual(["obsidian-git#1"]);
  });

  it("returns [] when the shown item is the plugin's only live one", () => {
    expect(cmdrHiddenSiblings("word-count", ["word-count#0", "a#0"], "word-count#0")).toEqual([]);
  });
});
```

Add `cmdrHiddenSiblings` to the test file's import list from `../src/core/statusBarItems`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/statusBarItems.test.ts`
Expected: FAIL — `cmdrHiddenSiblings` is not exported, and the updated calls fail to compile until the signature changes.

- [ ] **Step 3: Implement**

In `src/core/statusBarItems.ts`, replace the whole `computeStatusBarOrder` function with:

```ts
// Flex order per live id: stored ids first (ids absent from live are skipped — the CALLER
// keeps them in the stored array), then live ids missing from stored, in live order. Pinned
// ids (items whose own CSS sets a non-zero `order`, e.g. quick-explorer's left-region
// spacer) get NO entry: overriding their self-position was the 0.9.x bar-split bug.
export function computeStatusBarOrder(stored: string[], live: string[], pinned: Set<string>): Map<string, number> {
  const liveSet = new Set(live);
  const orders = new Map<string, number>();
  let next = 1;
  for (const id of stored) {
    if (liveSet.has(id) && !pinned.has(id) && !orders.has(id)) orders.set(id, next++);
  }
  for (const id of live) {
    if (!pinned.has(id) && !orders.has(id)) orders.set(id, next++);
  }
  return orders;
}
```

And append at the end of the file:

```ts
// When showing `shownId` has to clear Commander's plugin-level status bar hide (which would
// reveal EVERY item of that plugin), the plugin's other live items move to the own hidden
// list so their state survives. Returns those sibling ids.
export function cmdrHiddenSiblings(key: string, liveIds: string[], shownId: string): string[] {
  return liveIds.filter((id) => id !== shownId && splitStatusBarId(id).key === key);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/statusBarItems.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 5: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build FAILS at this point ONLY if Task 2 hasn't updated main.ts's call site — `tsc` will report the arity error in `src/main.ts:235`. That is expected mid-feature; to keep this task independently green, apply the minimal call-site fix now: in `src/main.ts` `applyStatusBarOrder()`, change

```ts
    const orders = computeStatusBarOrder(this.settings.statusBarOrder, live.map((i) => i.id));
```

to

```ts
    const orders = computeStatusBarOrder(this.settings.statusBarOrder, live.map((i) => i.id), new Set());
```

(Task 2 replaces this line with the real pinned set.) Then re-run: build clean; 65 tests (7 files unchanged count — same file); lint 0 problems.

---

### Task 2: main.ts runtime — hidden layer, pinned probe, two-layer show

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes (Task 1): `computeStatusBarOrder(stored, live, pinned)`, `cmdrHiddenSiblings(key, liveIds, shownId)`; existing `splitStatusBarId`, `withTitle`, `rebuildCmdrStyle`, `cmdrAccess`.
- Produces (Task 3 relies on these):
  - `settings.statusBarHidden: string[]`
  - `StatusBarSnapshotItem` gains `pinned: boolean; hidden: boolean`
  - `setStatusBarItemHidden(id: string, hidden: boolean): Promise<void>`
  - `statusBarLiveElements(): Map<string, HTMLElement>`

- [ ] **Step 1: Settings field + load + import**

Extend the settings interface (after `statusBarOrder`):

```ts
  statusBarHidden: string[];      // item ids hidden by this plugin's own layer (Commander's plugin-level hides merge in at read time)
```

Field initializer becomes:

```ts
  settings: RibbonOrganizerSettings = { menus: defaultMenus(), groups: defaultGroups(), statusBarOrder: [], statusBarHidden: [], statusBarShowOnMobile: false };
```

In `loadSettings()`, add `statusBarHidden?: unknown;` to the raw cast and `statusBarHidden: normalizeStatusBarOrder(raw.statusBarHidden),` to the constructed object (the id-list repair is generic — reused, not duplicated).

Update the statusBarItems import line to:

```ts
import { cmdrHiddenSiblings, computeStatusBarOrder, deriveStatusBarIds, normalizeStatusBarOrder, splitStatusBarId } from "./core/statusBarItems";
```

- [ ] **Step 2: Snapshot type, cmdr keys helper, pinned probe in liveStatusBarItems**

Replace the `StatusBarSnapshotItem` interface with:

```ts
// A live status bar item as exposed to the settings UI.
export interface StatusBarSnapshotItem {
  id: string;
  text: string;    // collapsed textContent preview
  pinned: boolean; // positions itself via its own CSS order; ordering leaves it alone
  hidden: boolean; // effective: own hidden list OR Commander's plugin-level hide
}
```

Below `cmdrHiddenTitles()`, add:

```ts
  // Plugin ids Commander hides on the status bar; empty when Commander is absent or unreadable.
  private cmdrHiddenStatusBarKeys(): Set<string> {
    const access = cmdrAccess(this.app);
    if (access.state !== "ok") return new Set();
    return new Set(access.plugin.settings.hide.statusbar.filter((t): t is string => typeof t === "string"));
  }
```

Replace the body of `liveStatusBarItems()`'s `els.forEach` block (and its return type) so the method reads:

```ts
  // Live .status-bar-item elements in DOM order with their derived ids and pinned probe;
  // null (once per session, with a Notice) when app.statusBar no longer matches the shape.
  private liveStatusBarItems(): { id: string; el: HTMLElement; pinned: boolean }[] | null {
    if (this.statusBarDisabled) return null;
    const container = statusBarContainer(this.app);
    if (container === null) {
      this.statusBarDisabled = true;
      console.error("Ribbon Organizer: app.statusBar does not match the expected shape; status bar ordering is disabled for this session");
      new Notice("Ribbon Organizer: status bar ordering is incompatible with this Obsidian version.");
      return null;
    }
    const els = Array.from(container.children).filter(
      (el): el is HTMLElement => el.instanceOf(HTMLElement) && el.classList.contains("status-bar-item")
    );
    const ids = deriveStatusBarIds(els.map((el) => Array.from(el.classList)));
    const out: { id: string; el: HTMLElement; pinned: boolean }[] = [];
    els.forEach((el, i) => {
      const id = ids[i];
      if (id === undefined) return;
      // Pinned probe: with the inline value cleared, a non-zero computed `order` means the
      // item's own CSS positions it (quick-explorer's order:-9999 spacer, order:9999 right-
      // pins). Clear + read + restore happen in one JS task — the browser never paints in
      // between, so callers that don't rewrite orders (snapshot) leave the bar untouched.
      const prev = el.style.order;
      el.setCssStyles({ order: "" });
      const pinned = getComputedStyle(el).order !== "0";
      if (prev !== "") el.setCssStyles({ order: prev });
      out.push({ id, el, pinned });
    });
    return out;
  }
```

- [ ] **Step 3: Snapshot, live-elements map, apply pass, hide toggle, unload**

Replace `statusBarSnapshot()` with:

```ts
  // The settings UI's view of the live status bar. hidden is the EFFECTIVE state:
  // this plugin's own per-item list OR Commander's plugin-level status bar hide.
  statusBarSnapshot(): StatusBarSnapshotItem[] | null {
    const live = this.liveStatusBarItems();
    if (live === null) return null;
    const ownHidden = new Set(this.settings.statusBarHidden);
    const cmdrKeys = this.cmdrHiddenStatusBarKeys();
    return live.map(({ id, el, pinned }) => ({
      id,
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      pinned,
      hidden: ownHidden.has(id) || cmdrKeys.has(splitStatusBarId(id).key),
    }));
  }

  // Live elements by id — spotlight targets and strip-clone sources for the settings UI
  // (one DOM scan per settings render, not one per row).
  statusBarLiveElements(): Map<string, HTMLElement> {
    const live = this.liveStatusBarItems();
    return new Map((live ?? []).map((i) => [i.id, i.el]));
  }
```

Replace `applyStatusBarOrder()` with:

```ts
  // Applies the stored order and this plugin's own hide layer as inline styles. Strict no-op
  // while statusBarOrder AND statusBarHidden are both empty (fresh installs keep a
  // byte-for-byte native bar). Pinned items never receive an order — overriding their own
  // CSS position was the 0.9.x left-region bug; a stale 0.9.x inline order on a pinned item
  // is cleared here, so the bar heals on the first apply after upgrade. Idempotent.
  applyStatusBarOrder(): void {
    if (this.settings.statusBarOrder.length === 0 && this.settings.statusBarHidden.length === 0) return;
    const live = this.liveStatusBarItems();
    if (live === null) return;
    this.statusBarObserver?.disconnect();
    const pinned = new Set(live.filter((i) => i.pinned).map((i) => i.id));
    const writeOrders = this.settings.statusBarOrder.length > 0;
    const orders = computeStatusBarOrder(this.settings.statusBarOrder, live.map((i) => i.id), pinned);
    const hidden = new Set(this.settings.statusBarHidden);
    for (const { id, el } of live) {
      const order = writeOrders ? orders.get(id) : undefined;
      el.setCssStyles({
        order: order === undefined ? "" : String(order),
        display: hidden.has(id) ? "none" : "",
      });
    }
    const container = statusBarContainer(this.app);
    if (container !== null) this.observeStatusBar(container);
  }
```

Below `applyMobileStatusBarClass()`, add:

```ts
  // The eye's target: asymmetric two-layer hide. Hiding writes ONLY this plugin's own
  // per-item list (Commander's status bar hides are plugin-level and cannot express a single
  // item). Showing clears both layers; because clearing Commander's plugin-level rule would
  // reveal every item of that plugin, the plugin's other live items move to the own list
  // first so their state survives.
  async setStatusBarItemHidden(id: string, hidden: boolean): Promise<void> {
    const withoutId = this.settings.statusBarHidden.filter((h) => h !== id);
    if (hidden) {
      this.settings.statusBarHidden = [...withoutId, id];
    } else {
      this.settings.statusBarHidden = withoutId;
      const key = splitStatusBarId(id).key;
      const access = cmdrAccess(this.app);
      if (access.state === "ok" && access.plugin.settings.hide.statusbar.includes(key)) {
        const live = this.liveStatusBarItems() ?? [];
        const siblings = cmdrHiddenSiblings(key, live.map((i) => i.id), id).filter((s) => !this.settings.statusBarHidden.includes(s));
        this.settings.statusBarHidden = [...this.settings.statusBarHidden, ...siblings];
        access.plugin.settings.hide.statusbar = withTitle(access.plugin.settings.hide.statusbar, key, false);
        await access.plugin.saveSettings();
        rebuildCmdrStyle(access.plugin.settings.hide);
      } else if (access.state === "broken") {
        console.error("Ribbon Organizer: Commander settings do not match the expected shape; changed this plugin's own hide layer only");
        new Notice("Ribbon Organizer: Commander settings look unexpected — the item may stay hidden by Commander.");
      }
    }
    await this.saveSettings();
    this.applyStatusBarOrder();
  }
```

In `onunload()`, the status-bar sweep line becomes (clears `display` too):

```ts
        if (el.instanceOf(HTMLElement) && el.classList.contains("status-bar-item")) el.setCssStyles({ order: "", display: "" });
```

- [ ] **Step 4: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 65 tests; lint 0 problems.

---

### Task 3: Settings UI — eyes, lock rows, strip, spotlight + CSS

**Files:**
- Modify: `src/ui/StatusBarSection.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes (Tasks 1–2): `StatusBarSnapshotItem { id, text, pinned, hidden }`, `plugin.setStatusBarItemHidden(id, hidden)`, `plugin.statusBarLiveElements()`, plus everything the section already uses.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Rewrite `src/ui/StatusBarSection.ts`**

Replace the file's content with:

```ts
import { App, ExtraButtonComponent, Setting, setIcon } from "obsidian";
import { fallbackItemName, splitStatusBarId, statusBarRowIds } from "../core/statusBarItems";
import { withScrollPreserved } from "./scrollKeep";
import type RibbonOrganizerPlugin from "../main";
import type { StatusBarSnapshotItem } from "../main";

// "Status bar" settings tab: a mobile-display toggle, a clone-based preview strip, and a
// flat drag list mirroring the status bar's final order. One order and visibility shared
// across devices: rows for ids this device doesn't have stay in place ("Not on this
// device"). Pinned rows (items that position themselves via their own CSS order) show a
// lock and are neither draggable nor drop targets; the eye still works on them.
export class StatusBarSection {
  private drag: string | null = null; // dragged row id
  private containerEl: HTMLElement | null = null;
  // Spotlight listeners attach to FOREIGN DOM (the real status bar items); every re-render
  // must detach the previous set and strip any lingering spot class.
  private spotCleanups: (() => void)[] = [];

  constructor(
    private app: App,
    private plugin: RibbonOrganizerPlugin
  ) {}

  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    withScrollPreserved(containerEl, () => this.renderContent(containerEl));
  }

  private renderContent(containerEl: HTMLElement): void {
    for (const cleanup of this.spotCleanups) cleanup();
    this.spotCleanups = [];
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
      text: "Drag to reorder the status bar; the eye hides an item everywhere. The same order and visibility apply on every device; items a device doesn't have are skipped there.",
    });

    const snapshot = this.plugin.statusBarSnapshot();
    if (snapshot === null) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Status bar ordering is incompatible with this Obsidian version." });
      return;
    }
    const liveEls = this.plugin.statusBarLiveElements();
    const clones = this.renderStrip(containerEl, snapshot, liveEls);

    const liveById = new Map(snapshot.map((i) => [i.id, i]));
    const rowIds = statusBarRowIds(this.plugin.settings.statusBarOrder, snapshot.map((i) => i.id));
    // Rows sharing a key need an ordinal so two "Git" rows stay tellable apart.
    const keyCounts = new Map<string, number>();
    for (const id of rowIds) {
      const { key } = splitStatusBarId(id);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-sb-list" });
    rowIds.forEach((id) => this.renderRow(listEl, id, rowIds, liveById.get(id), keyCounts, clones.get(id), liveEls.get(id)));

    // The hint doubles as the append drop target — insert-before alone cannot reach the end.
    const hint = containerEl.createDiv({ cls: "ribbon-organizer-sb-hint", text: "New items appear at the end." });
    this.wireDrop(hint, (draggedId) => {
      const out = rowIds.filter((r) => r !== draggedId);
      out.push(draggedId);
      this.persist(out);
    });
  }

  // A static, pixel-faithful mirror of the bar: clones of the visible live elements carry
  // their classes (theme/plugin CSS matches) and inline order; a pinned spacer clone keeps
  // its own order/flex-grow, so even the left/right split previews correctly. Clones are
  // inert: ids stripped (no duplicate DOM ids — quick-explorer nests one), listeners are
  // not copied by cloneNode, and the strip is aria-hidden.
  private renderStrip(
    containerEl: HTMLElement,
    snapshot: StatusBarSnapshotItem[],
    liveEls: Map<string, HTMLElement>
  ): Map<string, HTMLElement> {
    containerEl.createDiv({ cls: "ribbon-organizer-sb-strip-label", text: "Preview · hover a row or an item to locate it" });
    const strip = containerEl.createDiv({ cls: "status-bar ribbon-organizer-sb-strip", attr: { "aria-hidden": "true" } });
    const clones = new Map<string, HTMLElement>();
    for (const item of snapshot) {
      if (item.hidden) continue;
      const el = liveEls.get(item.id);
      if (el === undefined) continue;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      for (const idEl of Array.from(clone.querySelectorAll("[id]"))) idEl.removeAttribute("id");
      strip.appendChild(clone);
      clones.set(item.id, clone);
    }
    return clones;
  }

  private renderRow(
    listEl: HTMLElement,
    id: string,
    rowIds: string[],
    live: StatusBarSnapshotItem | undefined,
    keyCounts: Map<string, number>,
    clone: HTMLElement | undefined,
    liveEl: HTMLElement | undefined
  ): void {
    const { key, index } = splitStatusBarId(id);
    const pinned = live?.pinned === true;
    const row = listEl.createDiv({ cls: "ribbon-organizer-sb-item", attr: pinned ? {} : { draggable: "true" } });
    if (live === undefined) row.addClass("is-missing");
    if (live?.hidden === true) row.addClass("is-hidden");
    const grip = row.createSpan({ cls: pinned ? "ribbon-organizer-sb-lock" : "ribbon-organizer-rg-grip" });
    setIcon(grip, live === undefined ? "help" : pinned ? "lock" : "grip-vertical");
    const title = row.createSpan({ cls: "ribbon-organizer-sb-title", text: this.displayName(key) });
    if ((keyCounts.get(key) ?? 0) > 1) title.createSpan({ cls: "ribbon-organizer-sb-ordinal", text: ` · ${String(index + 1)}` });
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-sb-missing", text: "Not on this device" });
    else if (pinned) row.createSpan({ cls: "ribbon-organizer-sb-pintag", text: "Keeps its own position" });
    else if (live.text !== "") row.createSpan({ cls: "ribbon-organizer-sb-preview", text: live.text });
    row.createSpan({ cls: "ribbon-organizer-rg-plugin", text: key });
    if (live !== undefined) {
      const btns = row.createDiv({ cls: "ribbon-organizer-rg-btns" });
      const eye = new ExtraButtonComponent(btns)
        .setIcon(live.hidden ? "eye-off" : "eye")
        .setTooltip(live.hidden ? "Show this item" : "Hide this item")
        .onClick(() => {
          void this.plugin.setStatusBarItemHidden(id, !live.hidden).then(() => {
            if (this.containerEl !== null) this.render(this.containerEl);
          });
        });
      eye.extraSettingsEl.toggleClass("is-eye-off", live.hidden);
    }

    // Spotlight: hidden items have no visible body, missing items no body at all.
    if (live !== undefined && !live.hidden) this.wireSpot(row, clone, liveEl);

    if (pinned) return; // pinned rows neither drag nor accept drops
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

  // Three-way hover: entering the row, its strip clone, or the real bar item highlights the
  // other parties.
  private wireSpot(row: HTMLElement, clone: HTMLElement | undefined, liveEl: HTMLElement | undefined): void {
    const targets = [clone, liveEl].filter((t): t is HTMLElement => t !== undefined);
    if (targets.length === 0) return;
    const on = (): void => {
      row.addClass("is-hovered");
      for (const t of targets) t.addClass("ribbon-organizer-sb-spot");
    };
    const off = (): void => {
      row.removeClass("is-hovered");
      for (const t of targets) t.removeClass("ribbon-organizer-sb-spot");
    };
    const sources = [row, ...targets];
    for (const src of sources) {
      src.addEventListener("mouseenter", on);
      src.addEventListener("mouseleave", off);
    }
    this.spotCleanups.push(() => {
      off();
      for (const src of sources) {
        src.removeEventListener("mouseenter", on);
        src.removeEventListener("mouseleave", off);
      }
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

- [ ] **Step 2: styles.css — row states, strip, spotlight**

In the `/* ---------- Status bar tab ---------- */` block, append after the `.is-phone` lines:

```css
.ribbon-organizer-sb-item.is-hidden .ribbon-organizer-sb-title,
.ribbon-organizer-sb-item.is-hidden .ribbon-organizer-sb-preview { color: var(--text-faint); }
.ribbon-organizer-sb-item.is-hovered { background: var(--background-modifier-hover); box-shadow: inset 2px 0 0 var(--interactive-accent); }
.ribbon-organizer-sb-lock { display: inline-flex; color: var(--text-faint); --icon-size: 14px; }
.ribbon-organizer-sb-pintag { margin-left: auto; color: var(--text-faint); font-size: var(--font-ui-smaller); font-style: italic; }
.ribbon-organizer-sb-item .ribbon-organizer-rg-btns { flex: none; }
.ribbon-organizer-sb-strip-label { font-size: var(--font-ui-smaller); color: var(--text-faint);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
/* The strip reuses the status-bar class so theme/plugin item CSS styles the clones, then
 * re-asserts plain in-panel layout (core hides/floats the real bar on some platforms). */
.status-bar.ribbon-organizer-sb-strip { display: flex; position: static; width: 100%; max-width: none;
  flex-wrap: wrap; justify-content: flex-end; align-items: center;
  border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m);
  background: var(--background-secondary); padding: 4px 10px; margin-bottom: 8px; transform: none; }
.ribbon-organizer-sb-spot { outline: 1.5px solid var(--interactive-accent); outline-offset: 1px; border-radius: 3px; }
```

- [ ] **Step 3: styles.css — exclude the strip from the mobile-pill block**

In the mobile-pill block at the end of the file, change these four selectors (only the selector lines; declarations untouched):

- `body.ribbon-organizer-mobile-sb.is-mobile .status-bar {` → `body.ribbon-organizer-mobile-sb.is-mobile .status-bar:not(.ribbon-organizer-sb-strip) {`
- `body.ribbon-organizer-mobile-sb.is-mobile.is-hidden-nav .status-bar,` → `body.ribbon-organizer-mobile-sb.is-mobile.is-hidden-nav .status-bar:not(.ribbon-organizer-sb-strip),`
- `body.ribbon-organizer-mobile-sb.is-mobile:has(.cm-editor.cm-focused) .status-bar {` → `body.ribbon-organizer-mobile-sb.is-mobile:has(.cm-editor.cm-focused) .status-bar:not(.ribbon-organizer-sb-strip) {`
- `body.ribbon-organizer-mobile-sb.anp-floating-status-bar .status-bar::before {` → `body.ribbon-organizer-mobile-sb.anp-floating-status-bar .status-bar:not(.ribbon-organizer-sb-strip)::before {`

And the item-truncation selector:

- `body.ribbon-organizer-mobile-sb.is-mobile .status-bar .status-bar-item {` → `body.ribbon-organizer-mobile-sb.is-mobile .status-bar:not(.ribbon-organizer-sb-strip) .status-bar-item {`

- [ ] **Step 4: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 65 tests; lint 0 problems.

---

### Task 4: Docs

**Files:**
- Modify: `README.md`, `README.zh.md` (1-for-1 line replacements — line counts stay 60/60)
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: README feature bullet (both languages)**

`README.md` — replace the Status bar Features bullet with:

```markdown
- **Status bar** — drag the status bar items into your own order and hide the ones you don't need (one order and visibility shared across all devices), watch it in a live preview, and optionally show the status bar on phones and tablets as a floating pill above the toolbar.
```

`README.zh.md` — replace the corresponding bullet with:

```markdown
- **状态栏** — 拖拽调整状态栏条目的顺序,用眼睛按钮隐藏不需要的条目(所有设备共用一份顺序与可见性),内置实时预览;还可选择在手机和平板上以浮动胶囊的形式显示状态栏。
```

- [ ] **Step 2: README "### Status bar" paragraph (both languages)**

`README.md` — replace the single paragraph line under `### Status bar` with:

```markdown
The Status bar tab lists every status bar item; drag to reorder and use the eye to hide — both apply live and on every device, and items a device doesn't have keep their place ("Not on this device"). Hiding writes this plugin's own list; showing an item also clears Commander's plugin-level hide, quietly keeping that plugin's other items hidden so nothing pops back unasked. A preview strip mirrors the real bar, and hovering a row, the preview, or the bar itself highlights the same item in all three places. Items that position themselves (like quick-explorer's breadcrumbs region) show a lock — "Keeps its own position" — and are left exactly where their plugin puts them. Obsidian hides the status bar on mobile by default: the "Show on phones and tablets" toggle floats it above the toolbar, and ordering applies wherever the bar is visible. Items are recognized by their plugin; a plugin showing several items keeps them apart by position, which in rare cases can swap after an update of that plugin.
```

`README.zh.md` — replace the paragraph under `### 状态栏` with:

```markdown
「Status bar」标签页列出所有状态栏条目,拖拽排序、点眼睛隐藏——即时生效并同步到所有设备,本设备没有的条目保留原位(显示「Not on this device」)。隐藏只写本插件自己的列表;显示某个条目时会同时清除 Commander 的插件级隐藏,并自动保持该插件其它条目的隐藏状态,不会有东西不请自来。列表上方的预览条如实映射真实状态栏,悬停设置行、预览条目或状态栏本身,三处会同时高亮同一个条目。自己定位的条目(如 quick-explorer 的面包屑区域)显示锁图标——「Keeps its own position」——完全保留其插件设定的位置。Obsidian 在移动端默认隐藏状态栏:打开「Show on phones and tablets」开关后,状态栏会浮动在工具栏上方,排序作用于任何让状态栏可见的方式。条目按所属插件识别;同一插件的多个条目按位置区分,极少数情况下在该插件更新后可能互换。
```

Verify parity: `wc -l README.md README.zh.md` — both 60.

- [ ] **Step 3: ARCHITECTURE updates**

In the `core/statusBarItems.ts` module-map bullet, replace `order computation (stored first, absent kept by the caller, new appended)` with `order computation (stored first, absent kept by the caller, new appended, pinned ids excluded)` and append to the bullet's function list: `, cmdrHiddenSiblings (sibling migration when showing clears Commander's plugin-level hide)`.

In the `ui/StatusBarSection.ts` bullet, replace the parenthetical with: `(mobile-display toggle, clone-based preview strip, three-way hover spotlight with tracked cleanup, per-item eye, lock rows for self-positioned items, flat drag list — insert-before on rows, append via the footer hint)`.

In `## Core invariants`, append:

```markdown
- **Pinned status bar items are never ordered.** The apply pass probes each element (clear inline `order`, read computed, restore/write in one JS task — no paint in between); a non-zero computed `order` means the plugin positions the item itself (quick-explorer's `order:-9999` + `flex-grow:1` left-region spacer) and Ribbon Organizer leaves its position alone. Overriding it was the 0.9.x bar-split bug.
- **Status bar hide is asymmetric two-layer.** Hiding writes only `statusBarHidden` (per-item); reading merges Commander's plugin-level `hide.statusbar`; showing clears both, migrating the plugin's other live items into `statusBarHidden` first. Own-layer hiding is inline `display: none` in the same apply pass; Commander's stylesheet keeps handling its own rules.
- **The preview strip is inert clones.** `cloneNode(true)` of visible items into a `status-bar ribbon-organizer-sb-strip` container (theme CSS matches, ids stripped, aria-hidden, no listeners copied); the mobile-pill CSS block excludes the strip via `:not(.ribbon-organizer-sb-strip)` on every selector.
```

In `## Data model`, after the `statusBarOrder` bullet add:

```markdown
- `statusBarHidden: string[]` — item ids hidden by this plugin's own layer; Commander's plugin-level status bar hides merge in at read time only.
```

- [ ] **Step 4: Gates + parity**

Run: `npm run build && npm test && npm run lint && wc -l README.md README.zh.md`
Expected: build clean; 65 tests; lint 0 problems; 60/60.

---

## Controller smoke checklist (dev vault, after Tasks 2–3; not implementer steps)

- Synthetic pinned probe: eval-create `<div class="status-bar-item plugin-fake-pin" style="flex-grow:1">` plus a `<style>` giving `.plugin-fake-pin { order: -9999; }`; set a runtime order and apply → the fake item must receive NO inline order and the bar must split around it; settings list shows its row with lock + "Keeps its own position"; remove the fake afterwards.
- Eye: hide a live item → inline `display: none`, strip omits it, row greys; show → restored. With cmdr present: add a plugin key to cmdr's `hide.statusbar` + rebuild, then show one of that plugin's items → cmdr list loses the key, `style#cmdr` rebuilt, sibling ids appear in `statusBarHidden`.
- Strip: chip count = visible items; clones carry icons/text; no duplicate `#quick-explorer`-style ids (`document.querySelectorAll('[id="quick-explorer"]').length <= 1`).
- Spotlight: dispatch `mouseenter` on a row → live element and clone both carry `ribbon-organizer-sb-spot`; `mouseleave` clears; close settings → no `ribbon-organizer-sb-spot` remains anywhere.
- Unload: disable plugin → every inline `order`/`display` cleared, no spot classes, strip gone with the settings DOM.
- Owner-vault expectation after release: left-region split heals on first load with `statusBarOrder` untouched.
