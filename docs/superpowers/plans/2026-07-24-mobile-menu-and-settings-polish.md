# Mobile Menu Interception Rework + Settings Polish (0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone ≡ ribbon menu actually follow Ribbon Organizer grouping (0.6.0's wrap never intercepted real taps), right-align the phone settings rows without the redundant "hidden" chip, keep scroll position across settings re-renders, and add a clipboard diagnostics command for on-device verification.

**Architecture:** Replace the `showRibbonMenu` property wrap with a `document.body` childList MutationObserver that regroups any freshly inserted `.menu` while the navbar ≡ button carries `has-active-menu` (Obsidian's `Menu.showAtPosition` marks its parent element before appending the menu as a direct body child). Settings fixes are CSS plus a scroll-preserving render helper. A new command exports diagnostics JSON via the clipboard because iOS has no console.

**Tech Stack:** TypeScript Obsidian plugin, esbuild, vitest, eslint (obsidianmd preset).

**Spec:** `docs/superpowers/specs/2026-07-24-mobile-menu-and-settings-polish-design.md`

## Global Constraints

- **No git commits.** All changes stay uncommitted (owner's review state). Version bump to 0.7.0 happens only at an explicit "cut", outside this plan.
- Gates after every task: `npm run build` clean, `npx vitest run` green (44 existing tests, no new pure-core functions → no new unit tests), `npm run lint` 0 problems.
- Inline eslint-disable comments are forbidden by the repo preset; fix code or config, never disable inline.
- UI copy is sentence case ("Copy ribbon diagnostics").
- New code: strict typing, runtime validation of undocumented internals (`unknown` narrowed immediately), no default parameter values, no fallbacks that mask errors.
- Docs (README.md, README.zh.md, docs/ARCHITECTURE.md) updated in the same branch (docs-currency gate).

## File Structure

- Modify: `src/main.ts` — observer rework, `groupRibbonMenu(menuEl)` signature, diagnostics command.
- Modify: `src/ui/GroupsSection.ts` — hidden chip removal, scroll-preserved render, stale comment fix.
- Modify: `src/ui/QuickMenusSection.ts` — scroll-preserved render.
- Create: `src/ui/scrollKeep.ts` — `withScrollPreserved` helper.
- Modify: `styles.css` — chip rule removed, phone right-align rule added.
- Modify: `README.md`, `README.zh.md`, `docs/ARCHITECTURE.md`.

---

### Task 1: Menu-insertion observer replaces the showRibbonMenu wrap

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: existing `ribbonInternals(app)`, `computeMenuRows`, `renderIcon`, `cmdrHiddenTitles()`.
- Produces: `private groupRibbonMenu(menuEl: HTMLElement): void`; fields `menuObserver: MutationObserver | null`, `lastMenuOutcome: string` (Task 2 reads both).

- [ ] **Step 1: Update the import and fields**

In `src/main.ts` line 1, add `Platform` to the obsidian import:

```ts
import { addIcon, App, Menu, Notice, Platform, Plugin } from "obsidian";
```

Replace the field (current line 93)

```ts
  private mobileNavbarWrapped: { navbar: { showRibbonMenu: (evt: Event) => void }; original: (evt: Event) => void } | null = null;
```

with:

```ts
  private menuObserver: MutationObserver | null = null;
  private lastMenuOutcome = "not-run"; // surfaced by the diagnostics command
```

- [ ] **Step 2: Swap the onLayoutReady hook and the unload teardown**

In `onload()` replace `this.wrapMobileRibbonMenu();` with `this.observeMenus();`.

In `onunload()` replace the block

```ts
    if (this.mobileNavbarWrapped !== null) {
      this.mobileNavbarWrapped.navbar.showRibbonMenu = this.mobileNavbarWrapped.original;
      this.mobileNavbarWrapped = null;
    }
```

with:

```ts
    this.menuObserver?.disconnect();
    this.menuObserver = null;
```

- [ ] **Step 3: Replace wrapMobileRibbonMenu with the observer**

Delete the whole `wrapMobileRibbonMenu` method **and its leading comment block** (current lines 208–222). In its place:

```ts
  // Phone surface: the navbar ≡ button rebuilds a standard Menu from leftRibbon.items on every
  // open (array order, natively hidden items skipped) and appends it directly to document.body.
  // Property-wrapping mobileNavbar.showRibbonMenu never intercepts real taps — the navbar's
  // click listener captured a bound reference at construction — so the menu is caught at DOM
  // insertion instead: Menu.showAtPosition adds has-active-menu to its parent element (the ≡
  // span) before appending, which identifies the ribbon menu among all menus. The callback runs
  // at the microtask checkpoint, pre-paint, so the reorder is invisible; it only mutates nodes
  // inside the menu element, never body's child list, so it cannot retrigger itself.
  private observeMenus(): void {
    if (!Platform.isMobile) return;
    this.menuObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement && node.classList.contains("menu") && this.isRibbonMenuTrigger()) {
            this.groupRibbonMenu(node);
          }
        }
      }
    });
    this.menuObserver.observe(document.body, { childList: true });
  }

  // True while the navbar ≡ button is the active menu's parent (covers tap, long-press, and the
  // long-press menu when mobileQuickRibbonItem is configured).
  private isRibbonMenuTrigger(): boolean {
    const navbar = (this.app as unknown as { mobileNavbar?: { ribbonMenuItemEl?: unknown } }).mobileNavbar;
    if (navbar === undefined || navbar === null || !(navbar.ribbonMenuItemEl instanceof HTMLElement)) return false;
    return navbar.ribbonMenuItemEl.classList.contains("has-active-menu");
  }
```

- [ ] **Step 4: Change groupRibbonMenu to take the observed menu element and record outcomes**

Replace the whole `groupRibbonMenu` method (leading comment stays, minus its last sentence about "last .menu") with:

```ts
  // Row↔item mapping is index alignment: one .menu-item per non-natively-hidden item, in items
  // order (verified against Obsidian's showRibbonMenu source: it skips hidden items). On any
  // mismatch the menu is left untouched — native order, degraded but correct. Commander's CSS
  // hide targets side-dock-ribbon-action elements and misses these rows, so Commander-hidden
  // titles are dropped here explicitly. Every exit records lastMenuOutcome for diagnostics.
  private groupRibbonMenu(menuEl: HTMLElement): void {
    const internals = ribbonInternals(this.app);
    if (internals === null) {
      this.lastMenuOutcome = "no-internals";
      return;
    }
    const rowEls = Array.from(menuEl.querySelectorAll(".menu-item"));
    const nativeVisible = internals.items.filter((i) => !i.hidden);
    if (rowEls.length !== nativeVisible.length || rowEls.length === 0) {
      this.lastMenuOutcome = `bail: ${rowEls.length} rows vs ${nativeVisible.length} visible`;
      return;
    }
    const container = rowEls[0]?.parentElement;
    if (container === null || container === undefined) {
      this.lastMenuOutcome = "bail: no row container";
      return;
    }
    const cmdrHidden = this.cmdrHiddenTitles();
    const rowById = new Map<string, Element>();
    let dropped = 0;
    nativeVisible.forEach((item, i) => {
      const row = rowEls[i];
      if (row === undefined) return;
      if (cmdrHidden.has(item.title)) {
        row.remove();
        dropped += 1;
      } else rowById.set(item.id, row);
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
    this.lastMenuOutcome = `grouped: ${rowEls.length} rows, ${dropped} dropped`;
  }
```

- [ ] **Step 5: Gates**

Run: `npm run build` → clean; `npx vitest run` → 44 passed; `npm run lint` → 0 problems.

---

### Task 2: Diagnostics command "Copy ribbon diagnostics"

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: Task 1's `menuObserver`, `lastMenuOutcome`; existing `ribbonInternals`, `cmdrHiddenTitles`.
- Produces: command id `copy-ribbon-diagnostics` (full id `ribbon-organizer:copy-ribbon-diagnostics`).

- [ ] **Step 1: Register the command in onload()**

After `this.addSettingTab(...)`:

```ts
    this.addCommand({
      id: "copy-ribbon-diagnostics",
      name: "Copy ribbon diagnostics",
      callback: () => void this.copyDiagnostics(),
    });
```

- [ ] **Step 2: Add the method** (next to `groupRibbonMenu`)

```ts
  // On-device verification loop: iOS has no console, so the state needed to debug the phone
  // ribbon menu is exported through the clipboard instead. Failure surfaces as a Notice plus
  // console.error — never silently.
  private async copyDiagnostics(): Promise<void> {
    const navbar = (this.app as unknown as { mobileNavbar?: { ribbonMenuItemEl?: unknown } }).mobileNavbar;
    const internals = ribbonInternals(this.app);
    const cmdrHidden = this.cmdrHiddenTitles();
    const diagnostics = {
      version: this.manifest.version,
      platform: { isMobile: Platform.isMobile, isPhone: Platform.isPhone, isTablet: Platform.isTablet },
      mobileNavbar: navbar !== undefined && navbar !== null,
      ribbonMenuItemEl: navbar !== undefined && navbar !== null && navbar.ribbonMenuItemEl instanceof HTMLElement,
      menuObserverAttached: this.menuObserver !== null,
      items:
        internals === null
          ? null
          : internals.items.map((i) => ({ id: i.id, nativeHidden: i.hidden, cmdrHidden: cmdrHidden.has(i.title) })),
      lastMenuOutcome: this.lastMenuOutcome,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    } catch (error) {
      console.error("Ribbon Organizer: clipboard write failed", error);
      new Notice("Ribbon Organizer: could not write to the clipboard.");
      return;
    }
    new Notice("Ribbon diagnostics copied to clipboard.");
  }
```

- [ ] **Step 3: Gates**

Run: `npm run build`; `npx vitest run`; `npm run lint`. All clean.

---

### Task 3: Settings rows — drop the "hidden" chip, right-align on phones

**Files:**
- Modify: `src/ui/GroupsSection.ts`
- Modify: `styles.css`

- [ ] **Step 1: Remove the chip span**

In `GroupsSection.renderItemRow`, delete this line (current line 177):

```ts
    if (live?.hidden === true) row.createSpan({ cls: "ribbon-organizer-rg-hiddenchip", text: "hidden" });
```

Hidden state stays expressed by `is-hidden` row greying and the accent eye-off button.

- [ ] **Step 2: Update styles.css**

Delete the rule:

```css
.ribbon-organizer-rg-hiddenchip { font-size: var(--font-ui-smaller); color: var(--text-accent); background: var(--background-modifier-hover); border-radius: 8px; padding: 0 7px; }
```

In the phone block at the bottom (after the `.is-phone .ribbon-organizer-rg-plugin { display: none; }` line), add:

```css
/* The plugin badge is the row's auto-margin carrier on desktop; with it display-none on phones
 * the buttons take over right-alignment. */
.is-phone .ribbon-organizer-rg-item .ribbon-organizer-rg-btns { margin-left: auto; }
```

- [ ] **Step 3: Gates**

Run: `npm run build`; `npx vitest run`; `npm run lint`. All clean. (`grep -rn "hiddenchip" src/ styles.css` → no matches.)

---

### Task 4: Scroll preservation across section re-renders

**Files:**
- Create: `src/ui/scrollKeep.ts`
- Modify: `src/ui/GroupsSection.ts`
- Modify: `src/ui/QuickMenusSection.ts`

**Interfaces:**
- Produces: `withScrollPreserved(el: HTMLElement, render: () => void): void`.

- [ ] **Step 1: Create `src/ui/scrollKeep.ts`**

```ts
// Full section re-renders empty and rebuild their container; depending on when the browser
// reflows, the nearest scrollable ancestor can clamp its scrollTop to 0 while the container is
// empty (observed on phones — the eye toggle snapped the list back to the top). Carrying the
// position across the rebuild explicitly removes that timing dependency.
export function withScrollPreserved(el: HTMLElement, render: () => void): void {
  let scroller: HTMLElement | null = el;
  while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
  if (scroller === null) {
    render(); // nothing scrollable up the tree — no position to preserve
    return;
  }
  const scrollTop = scroller.scrollTop;
  render();
  scroller.scrollTop = scrollTop;
}
```

- [ ] **Step 2: Wrap GroupsSection.render**

Import: `import { withScrollPreserved } from "./scrollKeep";`

Change the method head from

```ts
  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    containerEl.empty();
```

to

```ts
  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    withScrollPreserved(containerEl, () => this.renderContent(containerEl));
  }

  private renderContent(containerEl: HTMLElement): void {
    containerEl.empty();
```

(The rest of the old `render` body becomes `renderContent` unchanged.)

In the class comment (current lines 22–23), replace

```
// the filter text survives re-renders; after every edit the section re-renders itself into
// its own container (the outer settings scroller is untouched, so scroll position holds).
```

with

```
// the filter text survives re-renders; after every edit the section re-renders itself into
// its own container, with the outer scroller's position carried across the rebuild.
```

- [ ] **Step 3: Wrap QuickMenusSection.render the same way**

Import: `import { withScrollPreserved } from "./scrollKeep";`

```ts
  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    withScrollPreserved(containerEl, () => this.renderContent(containerEl));
  }

  private renderContent(containerEl: HTMLElement): void {
    containerEl.empty();
```

(Rest of the old body becomes `renderContent` unchanged.)

- [ ] **Step 4: Gates**

Run: `npm run build`; `npx vitest run`; `npm run lint`. All clean.

---

### Task 5: Docs currency

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `README.md`, `README.zh.md`

- [ ] **Step 1: ARCHITECTURE.md**

Locate the phone/mobile menu paragraph (grep `showRibbonMenu`). Rewrite it to describe the new mechanism — the text must state: the property wrap was abandoned because the navbar's click listener captures a bound reference at construction; a body childList MutationObserver catches `.menu` insertion; the ribbon menu is identified by `has-active-menu` on `mobileNavbar.ribbonMenuItemEl`; row↔item index alignment against non-natively-hidden items with the untouched-menu safety valve; every exit records `lastMenuOutcome`. Add the `ui/scrollKeep.ts` bullet (scroll preserved across section re-renders) and mention the `copy-ribbon-diagnostics` command (clipboard JSON, exists because iOS has no console).

- [ ] **Step 2: README.md**

In the features/usage area (near the ribbon/hide description), add one line:

```md
- **Diagnostics**: the "Copy ribbon diagnostics" command copies a JSON snapshot (platform, hide layers per icon, last mobile-menu grouping outcome) to the clipboard — useful when reporting mobile issues.
```

- [ ] **Step 3: README.zh.md**

Matching line:

```md
- **诊断**:命令 "Copy ribbon diagnostics" 会把 JSON 快照(平台、每个图标的双层隐藏状态、最近一次手机菜单重排结果)复制到剪贴板,反馈移动端问题时使用。
```

- [ ] **Step 4: Gates**

Run: `npm run build`; `npx vitest run`; `npm run lint`. All clean.

---

### Task 6: Dev-vault e2e (controller runs inline, not a subagent)

Dev vault: `dev/vault/` (gitignored). Copy fresh `main.js`/`manifest.json`/`styles.css` into `dev/vault/.obsidian/plugins/ribbon-organizer/`, open the vault window (`open "obsidian://open?path=…"`), reload the plugin (`app.plugins.loadManifests()` + disable/enable via `obsidian eval`; the CLI routes by CWD — cd into the vault for every call).

- [ ] **E2E 1 — real tap path (the check that would have caught 0.6.0):** `app.emulateMobile(true)`, resize to phone (`window.resizeTo(400,850)`, expect `body.is-phone`), then **dispatch a click on `app.mobileNavbar.ribbonMenuItemEl`** (never call `showRibbonMenu` directly). Assert: last `.menu` in body has `.menu-separator` children, rows ordered per configured groups, natively hidden and cmdr-hidden titles absent, a moved row still fires its handler. Assert plugin field `lastMenuOutcome` starts with `grouped:`.
- [ ] **E2E 2 — settings scroll:** open RO settings → Ribbon tab, scroll the list down, toggle an eye on a deep row via DOM click. Assert the scroller's `scrollTop` is unchanged (±1px) and the row flipped to `is-hidden`.
- [ ] **E2E 3 — alignment DOM:** on the phone-emulated settings, assert item rows contain no `.ribbon-organizer-rg-hiddenchip` and that `.ribbon-organizer-rg-btns` right edge aligns with the row (offsetLeft + offsetWidth ≈ row width − padding).
- [ ] **E2E 4 — diagnostics:** run the command via `app.commands.executeCommandById("ribbon-organizer:copy-ribbon-diagnostics")`, read clipboard, `JSON.parse`, assert keys `version`, `platform`, `items`, `lastMenuOutcome`.
- [ ] Restore: `app.emulateMobile(false)`.

Real-device confirmation (owner, after cut + BRAT update): open ≡ once, run "Copy ribbon diagnostics", paste JSON back.

---

## Self-review notes

- Spec coverage: design §1→Task 1, §2→Task 3, §3→Task 4, §4→Task 2, testing→Task 6, docs→Task 5. No gaps.
- No placeholders; all code complete; names consistent (`menuObserver`, `lastMenuOutcome`, `withScrollPreserved`, `isRibbonMenuTrigger`, `renderContent`).
- Type check: `groupRibbonMenu(menuEl: HTMLElement)` — observer passes the added node after `instanceof HTMLElement` narrowing. `Platform` import added in Task 1, used again in Task 2.

---

### Task 7 (added mid-execution): Community-review compliance — setCssStyles

**Trigger:** Obsidian community-store automated review of 0.6.1 (commit 9be984f) FAILED with the
single Error `obsidianmd/no-static-styles-assignment` at src/main.ts:115 — the official review
does not honor repo-level eslint scope-offs.

- [x] Replace all three `style.order =` assignments in `src/main.ts` (onunload reset,
  applyGrouping per-item order, divider order) with `el.setCssStyles({ order: … })` — the
  API the rule itself sanctions; `""` clears the property identically.
- [x] Delete the `src/main.ts` scope-off block for `no-static-styles-assignment` from
  `eslint.config.mts` (no longer needed — the rule passes globally now).
- [x] Gates: build clean, 44 tests, lint 0 problems with the exemption removed.

Resubmission note: the official review runs against a release; the fix ships with the 0.7.0 cut,
then re-trigger the review there.
