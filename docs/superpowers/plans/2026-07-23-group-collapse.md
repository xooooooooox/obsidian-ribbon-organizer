# Group Collapse Implementation Plan (0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each group in the Ribbon groups settings tab collapsible, default collapsed, with a session-only expanded set, chevron + member count on headers, and filter-overrides-collapse visibility.

**Architecture:** UI-only change confined to `src/ui/GroupsSection.ts` + `styles.css`. Member rows always render; collapse is a CSS-hidden state (`is-collapsed` class) applied by the same in-place visibility pass that handles filtering. Expanded-group ids live in an in-memory `Set` on the section instance (like `filterQuery`), so edit-triggered re-renders keep it and reopening the panel resets to all-collapsed.

**Tech Stack:** TypeScript, esbuild, vitest (untouched), eslint-plugin-obsidianmd preset.

Spec: `docs/superpowers/specs/2026-07-23-group-collapse-design.md`

## Global Constraints

- **NO GIT COMMITS.** Leave all changes uncommitted (repo convention: the working tree is the user's review state). Never add Claude/AI attribution anywhere.
- Core layer (`src/core/`) is untouched. No new tests; the existing suite must stay green: **23 tests, 3 files**.
- Gates after each task: `npm run build` (clean), `npm test` (23 passed), `npm run lint` (**0 problems** — repo baseline).
- Lint preset forbids ALL inline `eslint-disable` comments. Fix code, never disable.
- All UI copy in English, sentence case.
- Two hidden-row classes with distinct meanings: existing `is-filtered-out` (query active, no match) and new `is-collapsed` (query empty, group not expanded). Never merge them.
- Behavior contract (from spec): default collapsed for every group incl. Ungrouped; filter query non-empty ⇒ row visibility depends only on the match (temporary expand, stored state untouched); clearing the query restores stored state; new group starts expanded; deleted group's id is removed from the set.

---

### Task 1: Collapse state, header chevron/count/toggle, visibility pass

**Files:**
- Modify: `src/ui/GroupsSection.ts`
- Modify: `styles.css` (Ribbon groups settings block, lines 49–74)

**Interfaces:**
- Consumes: existing `GroupsSection` internals only (`filterQuery`, `renderGroupHeader`, `renderItemRow`, `persist`).
- Produces: no exported API changes. `renderGroupHeader` gains a 4th parameter `memberCount: number` (private method, no external callers).

- [ ] **Step 1: Add the state fields**

In `src/ui/GroupsSection.ts`, below `private filterQuery = "";` add:

```ts
  private expanded = new Set<string>(); // group ids; empty = all collapsed (session-only, like filterQuery)
  private refreshVisibility: () => void = () => {};
```

- [ ] **Step 2: Extend the visibility pass in `render()`**

Replace the `itemRows` declaration and `applyFilter` closure:

```ts
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-rg-list" });
    const itemRows: { el: HTMLElement; haystack: string; groupId: string }[] = [];
    const applyFilter = (): void => {
      const q = this.filterQuery.trim().toLowerCase();
      for (const r of itemRows) {
        r.el.toggleClass("is-filtered-out", q !== "" && !r.haystack.includes(q));
        // A non-empty query temporarily reveals matches inside collapsed groups; stored state is untouched.
        r.el.toggleClass("is-collapsed", q === "" && !this.expanded.has(r.groupId));
      }
    };
    this.refreshVisibility = applyFilter;
```

(The existing `filterEl.addEventListener("input", …)` block stays as is — `applyFilter` now also handles collapse.)

- [ ] **Step 3: Compute members before the header and pass the count**

Replace the groups `forEach` body so `members` is computed first and rows record their group id:

```ts
    this.plugin.settings.groups.forEach((group, groupIndex) => {
      const members =
        group.id === UNGROUPED_ID
          ? snapshot.filter((i) => !claimed.has(i.id)).map((i) => ({ itemId: i.id, live: i }))
          : group.items.map((itemId) => ({ itemId, live: liveById.get(itemId) }));
      this.renderGroupHeader(listEl, group, groupIndex, members.length);
      members.forEach((m, memberIndex) => {
        const row = this.renderItemRow(listEl, group, m.itemId, m.live, memberIndex);
        const pluginId = m.itemId.split(":")[0] ?? "";
        itemRows.push({
          el: row,
          haystack: `${(m.live?.title ?? m.itemId).toLowerCase()} ${pluginId.toLowerCase()}`,
          groupId: group.id,
        });
      });
    });
    applyFilter();
```

- [ ] **Step 4: Chevron, count, click-toggle, and delete cleanup in `renderGroupHeader`**

Change the signature to `private renderGroupHeader(listEl: HTMLElement, group: RibbonGroup, groupIndex: number, memberCount: number): void` and update the body — chevron after the grip, count after the name, `expanded` cleanup in the delete handler, and a click listener at the end (before `dragstart`):

```ts
  private renderGroupHeader(listEl: HTMLElement, group: RibbonGroup, groupIndex: number, memberCount: number): void {
    const hdr = listEl.createDiv({ cls: "ribbon-organizer-rg-hdr", attr: { draggable: "true" } });
    const grip = hdr.createSpan({ cls: "ribbon-organizer-rg-grip" });
    setIcon(grip, "grip-vertical");
    const chevron = hdr.createSpan({ cls: "ribbon-organizer-rg-chevron" });
    setIcon(chevron, this.expanded.has(group.id) ? "chevron-down" : "chevron-right");
    const nameEl = hdr.createSpan({ cls: "ribbon-organizer-rg-name", text: group.name });
    hdr.createSpan({ cls: "ribbon-organizer-rg-count", text: `· ${memberCount}` });
    if (group.id === UNGROUPED_ID) {
      hdr.createSpan({ cls: "ribbon-organizer-rg-badge", text: "New icons land here" });
    } else {
      const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
      new ExtraButtonComponent(btns).setIcon("pencil").setTooltip("Rename group").onClick(() => this.startRename(nameEl, group));
      new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete group (members fall to ungrouped)").onClick(() => {
        this.expanded.delete(group.id);
        this.plugin.settings.groups = deleteGroup(this.plugin.settings.groups, group.id);
        this.persist();
      });
    }
    // Click toggles collapse; ignore clicks in the buttons area and on the inline-rename input.
    hdr.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.closest(".ribbon-organizer-rg-btns") !== null || t.tagName === "INPUT")) return;
      if (this.expanded.has(group.id)) this.expanded.delete(group.id);
      else this.expanded.add(group.id);
      setIcon(chevron, this.expanded.has(group.id) ? "chevron-down" : "chevron-right");
      this.refreshVisibility();
    });
    hdr.addEventListener("dragstart", (e) => this.onDragStart(e, { type: "group", groupId: group.id }));
```

(The `wireDropTarget(hdr, …)` block below stays unchanged — dropping an item on a collapsed header still appends to that group.)

- [ ] **Step 5: New group starts expanded**

Replace the "New group" button handler at the end of `render()`:

```ts
    new ButtonComponent(addbar).setButtonText("New group").onClick(() => {
      const id = crypto.randomUUID();
      this.expanded.add(id); // a just-created group is immediately renamed/filled — start it expanded
      this.plugin.settings.groups = addGroup(this.plugin.settings.groups, id, "New group");
      this.persist();
    });
```

- [ ] **Step 6: CSS**

In `styles.css`, inside the `/* Ribbon groups settings */` block:

After `.ribbon-organizer-rg-item.is-filtered-out { display: none; }` add:

```css
.ribbon-organizer-rg-item.is-collapsed { display: none; }
.ribbon-organizer-rg-chevron { display: inline-flex; color: var(--text-faint); --icon-size: 14px; }
.ribbon-organizer-rg-count { font-size: var(--font-ui-smaller); color: var(--text-faint); font-weight: 400; }
```

And add `cursor: pointer;` to the existing header rule so the whole line reads:

```css
.ribbon-organizer-rg-hdr { display: flex; align-items: center; gap: 8px; padding: 7px 10px; font-weight: 600;
  background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border); cursor: pointer; }
```

(`.ribbon-organizer-rg-grip`'s `cursor: grab` still wins on the grip itself — more specific target.)

- [ ] **Step 7: Gates**

Run: `npm run build` — Expected: exits 0, no tsc errors.
Run: `npm test` — Expected: `Tests  23 passed (23)`.
Run: `npm run lint` — Expected: no output (0 problems).

Do NOT commit.

---

### Task 2: Documentation currency (README, README.zh, ARCHITECTURE)

**Files:**
- Modify: `README.md:9` (Ribbon groups bullet)
- Modify: `README.zh.md` (Ribbon 分组 bullet)
- Modify: `docs/ARCHITECTURE.md:29` (`ui/GroupsSection.ts` module-map entry)

**Interfaces:**
- Consumes: the Task 1 behavior (collapsed by default, click header, count, filter override).
- Produces: nothing downstream.

- [ ] **Step 1: README.md bullet**

In the `- **Ribbon groups** (desktop):` bullet, after the sentence "A thin divider line renders between adjacent non-empty groups." insert:

```
Groups start collapsed (header shows a member count) — click a header to expand; filtering reveals matches inside collapsed groups.
```

- [ ] **Step 2: README.zh.md bullet**

In the `- **Ribbon 分组**(桌面端):` bullet, after "相邻的非空分组之间会渲染一条细分隔线。" insert:

```
分组默认折叠(组头显示成员数)——点击组头展开;过滤时会临时显示折叠分组中的匹配项。
```

- [ ] **Step 3: ARCHITECTURE.md module-map entry**

Replace the `ui/GroupsSection.ts` bullet (line 29) with:

```markdown
- **`ui/GroupsSection.ts`** — the Ribbon groups tab: a single column mirroring the ribbon's final order (group headers mark where dividers render), with in-place filter, collapsible groups (default collapsed; session-only `expanded` set, chevron + member count on headers; a non-empty filter query temporarily reveals matches inside collapsed groups without touching the stored state — two distinct hidden classes, `is-filtered-out` vs `is-collapsed`), HTML5 drag-and-drop (items within/across groups, whole groups onto headers; dropping on a collapsed header appends without expanding), a ⋮ "Move to group" menu, and inline rename. One instance lives on the SettingTab so filter text and collapse state survive re-renders; `persist()` = save → `applyGrouping()` → re-render own container (outer scroll position holds).
```

- [ ] **Step 4: Gates**

Run: `npm run lint` — Expected: no output (markdown not linted; run to confirm nothing regressed).

Do NOT commit.

---

## Live verification (controller/user, dev vault — after both tasks)

`npm run smoke:install`, reload the plugin in the dev vault, open Settings → Ribbon Organizer → Ribbon groups, then check the spec's list: opens fully collapsed; header click toggles and rename/delete buttons do not; count correct for real groups and Ungrouped; filter reveals matches inside collapsed groups and clearing restores state; drop onto a collapsed header lands in that group; edit-triggered re-render keeps expanded state; new group appears expanded.

Release (0.3.0) happens only on the user's explicit "cut".
