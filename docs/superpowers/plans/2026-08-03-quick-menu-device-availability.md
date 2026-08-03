# Quick menus: hide device-empty menus — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quick menu whose commands are all missing on this device registers no ribbon icon; the icon returns once a plugin is back and the menus rebuild (app reload or a quick-menu settings edit).

**Architecture:** One inline gate in `syncRibbonMenus()` reusing the existing `quickMenuEntries` availability computation; one test locking the entry shape the gate keys on; one GUIDE sentence.

**Tech Stack:** Obsidian plugin, TypeScript, esbuild, Vitest.

**Spec:** docs/superpowers/specs/2026-08-03-quick-menu-device-availability-design.md

## Global Constraints

- **NO COMMITS.** Working tree is the review state; one commit at cut.
- No new helper function or availability abstraction — the gate is an inline check on `quickMenuEntries` output (spec Non-goal).
- No event listeners, no polling, no `app.plugins` patching; availability is judged only where `syncRibbonMenus()` already runs.
- Gates: `npm run build` clean, `npm test` green (108 baseline + 1 new), `npm run lint` clean per the repo's baseline.
- Match existing file style; comments in English; no Claude/AI attribution anywhere.

---

### Task 1: Gate + test + GUIDE sentence

**Files:**
- Modify: `src/main.ts` (`syncRibbonMenus()`, ~line 875-893)
- Modify: `tests/quickCommands.test.ts` (inside the `quickMenuEntries` describe)
- Modify: `docs/GUIDE.md` (line 17, Quick menus chapter)

**Interfaces:**
- Consumes: `quickMenuEntries` from `src/core/quickCommands` (already imported in `main.ts` for `openMenu`).
- Produces: nothing other tasks rely on (single-task plan).

- [ ] **Step 1: Write the new test**

In `tests/quickCommands.test.ts`, add inside the `describe("quickMenuEntries", …)` block, after the `"returns [] when there is no command"` case:

```ts
  it("keeps all-missing commands as disabled entries (not an empty list)", () => {
    const out = quickMenuEntries(
      [{ commandId: "a:x", label: "X", icon: "i" }, { commandId: "b:y", label: "Y", icon: "i" }],
      reg([])
    );
    expect(out.map((e) => e.kind === "command" && e.disabled)).toEqual([true, true]);
  });
```

- [ ] **Step 2: Run it — expected to PASS already**

Run: `npx vitest run tests/quickCommands.test.ts`
Expected: PASS. This test documents existing behavior the gate depends on (all-missing menus come back as disabled entries, not `[]`); it guards against a future edit making `quickMenuEntries` collapse them, which would silently break the gate's semantics.

- [ ] **Step 3: Add the gate in `syncRibbonMenus()`**

In `src/main.ts`, the rebuild loop currently reads:

```ts
    this.menuIcons = [];
    for (const menu of this.settings.menus) {
      const el = this.addRibbonIcon(menu.icon, menu.name, (evt) => this.openMenu(evt, menu.id));
```

Replace with:

```ts
    this.menuIcons = [];
    const commands = (this.app as unknown as { commands: { commands: Record<string, unknown> } }).commands;
    for (const menu of this.settings.menus) {
      // A menu whose commands are all missing on this device gets no ribbon icon (the
      // settings tab still lists it, greyed); it re-registers on the next rebuild once a
      // command is back. Same availability source as openMenu: the live command registry.
      const entries = quickMenuEntries(menu.entries, (id) => id in commands.commands);
      if (!entries.some((e) => e.kind === "command" && !e.disabled)) continue;
      const el = this.addRibbonIcon(menu.icon, menu.name, (evt) => this.openMenu(evt, menu.id));
```

The rest of the loop body (renderIcon fallback, `this.menuIcons.push`) and the removal path above it stay untouched. `quickMenuEntries` is already imported at the top of `main.ts` — do not add an import.

- [ ] **Step 4: GUIDE sentence**

In `docs/GUIDE.md` line 17 (Quick menus chapter), the paragraph ends today with:

`…a command not installed on this device is greyed out and recovers automatically once its plugin is back.`

Append one sentence so it ends:

`…a command not installed on this device is greyed out and recovers automatically once its plugin is back. A menu whose commands are all missing on this device shows no ribbon icon; once one of its plugins is back, the icon returns at the next launch.`

- [ ] **Step 5: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean, 109 tests pass (108 + 1), lint clean per the repo baseline.

- [ ] **Step 6: Leave uncommitted** (NO-COMMITS mode)

---

## Final verification (controller, after the task)

- Task review (single task, whole-change lens: spec coverage, Non-goals untouched, GUIDE voice).
- Live verify in the dev vault: a menu whose only command belongs to a disabled plugin
  registers no ribbon icon after plugin (re)load; enabling that plugin and reloading brings
  the icon back; a mixed menu keeps its icon and greyed rows.
