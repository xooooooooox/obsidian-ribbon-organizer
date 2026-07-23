# Ribbon Hide + Settings Polish + Plugin Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eye-toggle hide for ribbon icons that mirrors and writes BOTH Obsidian's native hide and Commander's hide; group-header polish (no pencil, count pill); tab renamed "Ribbon"; plugin icon assets (RO-B).

**Architecture:** A new pure module `core/commanderHide.ts` replicates Commander's injected-CSS rule format; `main.ts` gains `setIconHidden` (native `item.hidden` + `leftRibbon.onChange(true)` + re-apply grouping; Commander list edit + `saveSettings` + `style#cmdr` rebuild) and computes EFFECTIVE hidden (native ∨ Commander) for both the snapshot and the layout; `GroupsSection` renders the eye toggles, hidden-row styling, inline name rename and the count pill.

**Tech Stack:** TypeScript, esbuild, vitest, eslint-plugin-obsidianmd (baseline 0, inline disables forbidden).

**Spec:** `docs/superpowers/specs/2026-07-23-ribbon-hide-and-polish-design.md`

## Global Constraints

- NO COMMITS: leave all changes uncommitted (vault-owner convention; the controller commits only at cut, on explicit request). Ignore any commit steps implied by tooling.
- Hide semantics (user 定稿): read = native ∨ Commander; hide writes BOTH layers; unhide clears BOTH; Commander absent → native only, silent; Commander present but shape-broken → native only + one Notice.
- Native write path is exactly: mutate raw `leftRibbon.items[i].hidden`, call `leftRibbon.onChange(true)`, then `applyGrouping()` (onChange's `setChildrenInPlace` drops our dividers).
- Commander CSS rule format must be byte-for-byte: `div.side-dock-ribbon-action[aria-label="${title}"] {display: none !important; content-visibility: hidden;}` (leftRibbon, first) and `div.status-bar-item.plugin-${id} {display: none !important; content-visibility: hidden;}` (statusbar, second, preserved verbatim — never edited).
- Tab label: "Ribbon" (was "Ribbon groups"). Settings-search desc: "Ribbon and quick commands."
- Count pill: `n` = all member rows (missing included — today's number). With ≥1 effective-hidden live member: `v/n`, `v = n − hiddenCount`, the `/n` part dimmed. Otherwise plain `n`.
- Gates: `npm run build`, `npm test`, `npm run lint` — all clean (lint baseline 0).
- New code matches the repo's comment/naming style (sentence-case UI copy; brands list is `['Ribbon Organizer', 'Obsidian']` — "Commander" in UI copy is a brand name, capitalize it in text, and if the sentence-case lint rule flags it, add "Commander" to the `brands` array in `eslint.config.mts` rather than any inline disable).

---

### Task 1: `core/commanderHide.ts` + tests

**Files:**
- Create: `src/core/commanderHide.ts`
- Create: `tests/commanderHide.test.ts`

**Interfaces:**
- Consumes: nothing (pure, Obsidian-free).
- Produces: `interface CmdrHideLists { leftRibbon: string[]; statusbar: string[] }`, `cmdrHideStyleText(hide: CmdrHideLists): string`, `withTitle(list: string[], title: string, present: boolean): string[]` — Task 2 imports all three.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/commanderHide.test.ts
import { describe, expect, it } from "vitest";
import { cmdrHideStyleText, withTitle } from "../src/core/commanderHide";

describe("cmdrHideStyleText", () => {
  it("emits Commander's exact ribbon rule per title, in list order", () => {
    expect(cmdrHideStyleText({ leftRibbon: ["Open graph view", "BRAT"], statusbar: [] })).toBe(
      'div.side-dock-ribbon-action[aria-label="Open graph view"] {display: none !important; content-visibility: hidden;}' +
        'div.side-dock-ribbon-action[aria-label="BRAT"] {display: none !important; content-visibility: hidden;}'
    );
  });

  it("appends statusbar rules after ribbon rules, verbatim", () => {
    expect(cmdrHideStyleText({ leftRibbon: ["A"], statusbar: ["word-count"] })).toBe(
      'div.side-dock-ribbon-action[aria-label="A"] {display: none !important; content-visibility: hidden;}' +
        "div.status-bar-item.plugin-word-count {display: none !important; content-visibility: hidden;}"
    );
  });

  it("returns the empty string for empty lists", () => {
    expect(cmdrHideStyleText({ leftRibbon: [], statusbar: [] })).toBe("");
  });
});

describe("withTitle", () => {
  it("adds a title once, even when already present", () => {
    expect(withTitle(["A"], "B", true)).toEqual(["A", "B"]);
    expect(withTitle(["A", "B"], "B", true)).toEqual(["A", "B"]);
  });

  it("removes every occurrence", () => {
    expect(withTitle(["A", "B", "A"], "A", false)).toEqual(["B"]);
  });

  it("never mutates its input", () => {
    const input = ["A"];
    withTitle(input, "B", true);
    withTitle(input, "A", false);
    expect(input).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commanderHide.test.ts`
Expected: FAIL — cannot resolve `../src/core/commanderHide`.

- [ ] **Step 3: Implement the module**

```ts
// src/core/commanderHide.ts
// Commander (plugin id "cmdr") hides ribbon icons per TITLE via a stylesheet it injects as
// <style id="cmdr">. Its CSS builder is module-private, so when Ribbon Organizer edits
// Commander's hide list it must rebuild that stylesheet itself — same-session unhide would
// otherwise stay hidden behind the stale rule. The rule format below is byte-for-byte
// Commander's own (leftRibbon rules first, then statusbar, no separators).

export interface CmdrHideLists {
  leftRibbon: string[]; // ribbon icon titles (aria-labels)
  statusbar: string[];  // plugin ids; preserved verbatim, never edited by Ribbon Organizer
}

export function cmdrHideStyleText(hide: CmdrHideLists): string {
  let text = "";
  for (const title of hide.leftRibbon) {
    text += `div.side-dock-ribbon-action[aria-label="${title}"] {display: none !important; content-visibility: hidden;}`;
  }
  for (const id of hide.statusbar) {
    text += `div.status-bar-item.plugin-${id} {display: none !important; content-visibility: hidden;}`;
  }
  return text;
}

// New list with the title present exactly once, or absent entirely.
export function withTitle(list: string[], title: string, present: boolean): string[] {
  const without = list.filter((t) => t !== title);
  return present ? [...without, title] : without;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/commanderHide.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Full gates**

Run: `npm run build && npm test && npm run lint`
Expected: all clean (suite grows from 34 to 40).

---

### Task 2: `main.ts` — effective hidden + `setIconHidden`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: Task 1's `CmdrHideLists`, `cmdrHideStyleText`, `withTitle`.
- Produces: `setIconHidden(itemId: string, hidden: boolean): Promise<void>` (public, Task 3 calls it); `ribbonSnapshot()` items' `hidden` becomes the EFFECTIVE value (Task 3 reads it).

- [ ] **Step 1: Add imports**

In `src/main.ts`, extend the imports:

```ts
import { CmdrHideLists, cmdrHideStyleText, withTitle } from "./core/commanderHide";
```

- [ ] **Step 2: Add the Commander accessor + style rebuilder (below `ribbonInternals`)**

```ts
interface CmdrPlugin {
  settings: { hide: CmdrHideLists };
  saveSettings: () => Promise<void>;
}

// Commander in three states: absent (not installed / disabled — app.plugins.plugins only
// holds enabled instances), ok (shape validated), broken (present but its settings changed shape).
type CmdrAccess = { state: "absent" } | { state: "ok"; plugin: CmdrPlugin } | { state: "broken" };

function cmdrAccess(app: App): CmdrAccess {
  const cmdr = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins?.["cmdr"];
  if (cmdr === undefined || cmdr === null) return { state: "absent" };
  const c = cmdr as { settings?: { hide?: { leftRibbon?: unknown; statusbar?: unknown } }; saveSettings?: unknown };
  if (!Array.isArray(c.settings?.hide?.leftRibbon) || !Array.isArray(c.settings?.hide?.statusbar) || typeof c.saveSettings !== "function") {
    return { state: "broken" };
  }
  return { state: "ok", plugin: cmdr as CmdrPlugin };
}

// Replaces Commander's injected stylesheet exactly the way Commander itself does
// (remove #cmdr, append only when the text is non-empty).
function rebuildCmdrStyle(hide: CmdrHideLists): void {
  document.head.querySelector("style#cmdr")?.remove();
  const text = cmdrHideStyleText(hide);
  if (text !== "") document.head.appendChild(createEl("style", { attr: { id: "cmdr" }, text, type: "text/css" }));
}
```

- [ ] **Step 3: Effective hidden in snapshot and layout**

Add the private helper to the plugin class:

```ts
// Titles Commander currently hides; empty when Commander is absent or unreadable.
private cmdrHiddenTitles(): Set<string> {
  const access = cmdrAccess(this.app);
  if (access.state !== "ok") return new Set();
  return new Set(access.plugin.settings.hide.leftRibbon.filter((t): t is string => typeof t === "string"));
}
```

Replace `ribbonSnapshot`'s map so `hidden` is the effective value:

```ts
ribbonSnapshot(): RibbonSnapshotItem[] | null {
  const internals = ribbonInternals(this.app);
  if (internals === null) return null;
  const cmdrHidden = this.cmdrHiddenTitles();
  // hidden is the EFFECTIVE state: Obsidian's native flag OR Commander's title list.
  return internals.items.map(({ id, title, icon, hidden }) => ({ id, title, icon, hidden: hidden || cmdrHidden.has(title) }));
}
```

In `applyGrouping`, replace the `computeRibbonLayout` call (this fixes the phantom divider around all-Commander-hidden groups):

```ts
const cmdrHidden = this.cmdrHiddenTitles();
const layout = computeRibbonLayout(
  this.settings.groups,
  internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title) }))
);
```

- [ ] **Step 4: Add `setIconHidden`**

Public method on the plugin class:

```ts
// One switch over both hide layers (spec 定稿 2026-07-23): hiding sets Obsidian's native flag
// AND adds the title to Commander's list; showing clears both — a single still-set layer
// would keep the icon hidden and make the toggle look broken. Commander absent → native only.
async setIconHidden(itemId: string, hidden: boolean): Promise<void> {
  const ribbon = (this.app.workspace as unknown as { leftRibbon?: { items?: unknown; onChange?: unknown } }).leftRibbon;
  const items = ribbon !== undefined && Array.isArray(ribbon.items) ? (ribbon.items as { id?: unknown; title?: unknown; hidden?: unknown }[]) : null;
  const raw = items?.find((it) => it.id === itemId);
  if (raw === undefined) return; // icon no longer live; the stale row disappears on the next render
  if (typeof ribbon?.onChange === "function") {
    raw.hidden = hidden;
    // Native path (verified in the dev vault 2026-07-23): onChange toggles every buttonEl,
    // rebuilds the ribbon children (setChildrenInPlace drops our dividers) and persists via
    // requestSaveLayout — hence the applyGrouping right after.
    (ribbon.onChange as (persist: boolean) => void).call(ribbon, true);
    this.applyGrouping();
  } else {
    console.error("Ribbon Organizer: leftRibbon.onChange is missing; the native hide flag was not changed");
    new Notice("Ribbon Organizer: cannot toggle the native hide on this Obsidian version.");
  }
  const title = typeof raw.title === "string" ? raw.title : itemId.slice(itemId.indexOf(":") + 1);
  const access = cmdrAccess(this.app);
  if (access.state === "absent") return;
  if (access.state === "broken") {
    console.error("Ribbon Organizer: Commander settings do not match the expected shape; changed the native hide only");
    new Notice("Ribbon Organizer: Commander settings look unexpected — changed the native hide only.");
    return;
  }
  access.plugin.settings.hide.leftRibbon = withTitle(access.plugin.settings.hide.leftRibbon, title, hidden);
  await access.plugin.saveSettings();
  rebuildCmdrStyle(access.plugin.settings.hide);
}
```

- [ ] **Step 5: Full gates**

Run: `npm run build && npm test && npm run lint`
Expected: all clean. (If the sentence-case rule flags "Commander" in the Notice copy, add `'Commander'` to the `brands` array in `eslint.config.mts` — never an inline disable.)

---

### Task 3: Settings UI — tab rename, header polish, eye toggles

**Files:**
- Modify: `src/ui/SettingTab.ts`
- Modify: `src/ui/GroupsSection.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `plugin.setIconHidden(itemId, hidden)` and effective `RibbonSnapshotItem.hidden` from Task 2.
- Produces: nothing new for later tasks.

- [ ] **Step 1: `SettingTab.ts` rename**

In `TABS`: `{ id: "groups", label: "Ribbon groups", icon: "rows-3" }` → `{ id: "groups", label: "Ribbon", icon: "rows-3" }`.
In `getSettingDefinitions`: `desc: "Ribbon groups and quick commands."` → `desc: "Ribbon and quick commands."`; append `"hide"` to the `aliases` array.

- [ ] **Step 2: `GroupsSection.ts` — tab description**

Replace the `ribbon-organizer-tab-desc` text with:

```
Order the left-ribbon icons into groups and toggle their visibility. Hiding an icon here also hides it in Obsidian and Commander; a divider renders between adjacent non-empty groups.
```

- [ ] **Step 3: `GroupsSection.ts` — header: counts + inline rename, pencil removed**

Change the render loop's call from `this.renderGroupHeader(listEl, group, groupIndex, members.length)` to `this.renderGroupHeader(listEl, group, groupIndex, members)` and replace the header method's signature and top half:

```ts
private renderGroupHeader(
  listEl: HTMLElement,
  group: RibbonGroup,
  groupIndex: number,
  members: { itemId: string; live: RibbonSnapshotItem | undefined }[]
): void {
  const hdr = listEl.createDiv({ cls: "ribbon-organizer-rg-hdr", attr: { draggable: "true" } });
  const grip = hdr.createSpan({ cls: "ribbon-organizer-rg-grip" });
  setIcon(grip, "grip-vertical");
  const chevron = hdr.createSpan({ cls: "ribbon-organizer-rg-chevron" });
  setIcon(chevron, this.expanded.has(group.id) ? "chevron-down" : "chevron-right");
  const nameEl = hdr.createSpan({ cls: "ribbon-organizer-rg-name", text: group.name });
  // Count pill: n member rows (missing included); with hidden members it reads v/n, total dimmed.
  const hiddenCount = members.filter((m) => m.live?.hidden === true).length;
  const count = hdr.createSpan({ cls: "ribbon-organizer-rg-count" });
  count.appendText(String(members.length - hiddenCount));
  if (hiddenCount > 0) count.createSpan({ cls: "ribbon-organizer-rg-count-total", text: `/${members.length}` });
  if (group.id === UNGROUPED_ID) {
    hdr.createSpan({ cls: "ribbon-organizer-rg-badge", text: "New icons land here" });
  } else {
    // Click the name to rename in place — the pencil button is gone (same interaction as the
    // Quick commands tab). stopPropagation keeps the click from toggling the collapse.
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.startRename(nameEl, group);
    });
    const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
    new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete group (members fall to ungrouped)").onClick(() => {
      this.expanded.delete(group.id);
      this.plugin.settings.groups = deleteGroup(this.plugin.settings.groups, group.id);
      this.persist();
    });
  }
  // …collapse-toggle click listener, dragstart and wireDropTarget wiring: UNCHANGED from today…
}
```

The pencil `ExtraButtonComponent` line is deleted; nothing else in the click/drag wiring changes. `startRename` itself is unchanged.

- [ ] **Step 4: `GroupsSection.ts` — item rows: hidden visuals + eye toggle**

In `renderItemRow`, after `if (live === undefined) row.addClass("is-missing");` add:

```ts
if (live?.hidden === true) row.addClass("is-hidden");
```

After the title span (`ribbon-organizer-rg-title`) add:

```ts
if (live?.hidden === true) row.createSpan({ cls: "ribbon-organizer-rg-hiddenchip", text: "hidden" });
```

In the buttons area, insert the eye BEFORE the existing `ellipsis-vertical` move button — only for live rows (a missing item has nothing to hide here):

```ts
const btns = row.createDiv({ cls: "ribbon-organizer-rg-btns" });
if (live !== undefined) {
  const eye = new ExtraButtonComponent(btns)
    .setIcon(live.hidden ? "eye-off" : "eye")
    .setTooltip(live.hidden ? "Show this icon" : "Hide this icon")
    .onClick(() => {
      void this.plugin.setIconHidden(itemId, !live.hidden).then(() => {
        if (this.containerEl !== null) this.render(this.containerEl); // hide state lives outside our settings — re-render only
      });
    });
  eye.extraSettingsEl.toggleClass("is-eye-off", live.hidden);
}
const more = new ExtraButtonComponent(btns).setIcon("ellipsis-vertical").setTooltip("Move to group");
```

- [ ] **Step 5: `styles.css`**

Replace the `.ribbon-organizer-rg-count` rule and add the new ones next to it:

```css
.ribbon-organizer-rg-count { font-size: var(--font-ui-smaller); color: var(--text-muted); font-weight: 400; background: var(--background-modifier-hover); border-radius: 9px; padding: 1px 8px; }
.ribbon-organizer-rg-count-total { color: var(--text-faint); }
.ribbon-organizer-rg-name { cursor: text; }
.ribbon-organizer-rg-item.is-hidden .ribbon-organizer-rg-icon,
.ribbon-organizer-rg-item.is-hidden .ribbon-organizer-rg-title { color: var(--text-faint); }
.ribbon-organizer-rg-hiddenchip { font-size: var(--font-ui-smaller); color: var(--text-accent); background: var(--background-modifier-hover); border-radius: 8px; padding: 0 7px; }
.ribbon-organizer-rg-btns .is-eye-off { color: var(--text-accent); }
```

- [ ] **Step 6: Full gates**

Run: `npm run build && npm test && npm run lint`
Expected: all clean.

---

### Task 4: Assets + docs

**Files:**
- Create: `assets/icon.svg`, `assets/logo.svg`, `assets/social-preview.svg`
- Modify: `README.md`, `README.zh.md`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: Write the three SVGs exactly**

`assets/icon.svg` (RO-B mark; iconize-importable — 24×24, currentColor):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v18"/><circle cx="5.75" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="5.75" cy="11" r="1.2" fill="currentColor" stroke="none"/><path d="M4.4 14h2.7"/><circle cx="5.75" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg>
```

`assets/logo.svg` (README tile, 256×256, mark centered: 24×6=144, offset (256−144)/2=56):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d48a5b"/><stop offset="1" stop-color="#c25bd4"/></linearGradient></defs>
  <rect width="256" height="256" rx="56" fill="url(#g)"/>
  <g transform="translate(56 56) scale(6)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v18"/><circle cx="5.75" cy="7.5" r="1.2" fill="#ffffff" stroke="none"/><circle cx="5.75" cy="11" r="1.2" fill="#ffffff" stroke="none"/><path d="M4.4 14h2.7"/><circle cx="5.75" cy="17" r="1.2" fill="#ffffff" stroke="none"/>
  </g>
</svg>
```

`assets/social-preview.svg` (1280×640):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" font-family="-apple-system, 'Segoe UI', sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26202b"/><stop offset="1" stop-color="#171519"/></linearGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d48a5b"/><stop offset="1" stop-color="#c25bd4"/></linearGradient>
  </defs>
  <rect width="1280" height="640" fill="url(#bg)"/>
  <rect x="240" y="212" width="216" height="216" rx="48" fill="url(#tile)"/>
  <g transform="translate(276 248) scale(6)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.5" y="3" width="19" height="18" rx="3"/><path d="M9 3v18"/><circle cx="5.75" cy="7.5" r="1.2" fill="#ffffff" stroke="none"/><circle cx="5.75" cy="11" r="1.2" fill="#ffffff" stroke="none"/><path d="M4.4 14h2.7"/><circle cx="5.75" cy="17" r="1.2" fill="#ffffff" stroke="none"/>
  </g>
  <text x="516" y="316" fill="#f0eef2" font-size="64" font-weight="700">Ribbon Organizer</text>
  <text x="518" y="372" fill="#a89fb3" font-size="30">Group, reorder and hide your Obsidian ribbon icons</text>
</svg>
```

- [ ] **Step 2: README logos**

In `README.md` and `README.zh.md`, insert as the very first line, above the H1 (keep everything else, including badges, intact):

```md
<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon Organizer logo"></p>
```

- [ ] **Step 3: README feature docs**

In both READMEs' feature/usage sections (mirror EN/zh):
- Rename tab references "Ribbon groups" → "Ribbon" where they describe the tab (feature names stay descriptive).
- Add a hide bullet (EN; translate for zh): "**Hide icons** — every row has an eye toggle. Hiding writes both Obsidian's native hide and Commander's hide list (when Commander is installed), and showing clears both, so the three UIs never disagree. Note: Commander matches icons by title, so two same-titled icons share the hide; renaming an icon (e.g. a quick menu) drops its Commander entry."
- Mention the count pill in the groups description ("the header pill shows visible/total when some members are hidden").

- [ ] **Step 4: `docs/ARCHITECTURE.md`**

Update the module map and behaviors:
- `core/commanderHide.ts` — Commander stylesheet rule format + list helper (why: private builder, same-session unhide).
- `main.ts` — `cmdrAccess` three-state guard, `rebuildCmdrStyle`, `setIconHidden` (native mutate + `onChange(true)` + `applyGrouping`; Commander list + save + style rebuild), effective hidden (native ∨ Commander) feeding `ribbonSnapshot` and `computeRibbonLayout` (phantom-divider fix).
- Settings shape unchanged (hide state lives in Obsidian/Commander, not in RO's data.json).
- `assets/` directory purpose.

- [ ] **Step 5: Full gates**

Run: `npm run build && npm test && npm run lint`
Expected: all clean (docs/assets shouldn't affect them; this catches accidental source edits).
