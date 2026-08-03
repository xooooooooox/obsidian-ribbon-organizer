# Quick menus: hide missing-command rows from the popup — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ribbon popup of a quick menu lists only commands available on this device; missing commands keep their greyed row in settings only.

**Architecture:** Extract the separator-normalization loop already inside `quickMenuEntries` into a module-private helper; add pure `presentQuickMenuEntries` on top of it; `openMenu` renders the presented list and drops its `setDisabled` branch. One GUIDE sentence updated.

**Tech Stack:** Obsidian plugin, TypeScript, esbuild, Vitest.

**Spec:** docs/superpowers/specs/2026-08-03-quick-menu-hide-missing-rows-design.md

## Global Constraints

- **NO COMMITS.** Working tree is the review state; one commit at cut.
- `quickMenuEntries`'s observable behavior must not change (settings tab and the 0.17.1 ribbon-icon gate consume it); the normalization extraction is internal only.
- No settings-tab changes, no icon-gate changes, no mid-session re-evaluation (spec Non-goals).
- Gates: `npm run build` clean, `npm test` green (109 baseline + 5 new = 114), `npm run lint` clean.
- Match existing file style; comments in English; no Claude/AI attribution anywhere.

---

### Task 1: `presentQuickMenuEntries` + `openMenu` + GUIDE

**Files:**
- Modify: `src/core/quickCommands.ts`
- Modify: `src/main.ts` (import line 4; `openMenu` ~lines 903-934)
- Modify: `tests/quickCommands.test.ts`
- Modify: `docs/GUIDE.md` (Quick menus chapter, line 17)

**Interfaces:**
- Consumes: existing `QuickMenuEntry` type and `quickMenuEntries` from `src/core/quickCommands`.
- Produces: `export function presentQuickMenuEntries(entries: QuickMenuEntry[]): QuickMenuEntry[]`.

- [ ] **Step 1: Write the failing tests**

In `tests/quickCommands.test.ts`, extend the import to
`import { commandOwnerId, presentQuickMenuEntries, quickMenuEntries } from "../src/core/quickCommands";`
and `import type { QuickMenuEntry } from "../src/core/quickCommands";`, then add after the `quickMenuEntries` describe block:

```ts
const cmd = (id: string, disabled: boolean): QuickMenuEntry => ({ kind: "command", commandId: id, label: id, icon: "i", disabled });
const sep: QuickMenuEntry = { kind: "separator" };

describe("presentQuickMenuEntries", () => {
  it("drops disabled commands and keeps available ones", () => {
    expect(presentQuickMenuEntries([cmd("a:x", true), cmd("b:y", false)])).toEqual([cmd("b:y", false)]);
  });

  it("drops a separator orphaned at the head", () => {
    expect(presentQuickMenuEntries([cmd("a:x", true), sep, cmd("b:y", false)])).toEqual([cmd("b:y", false)]);
  });

  it("collapses separators left adjacent by a removal", () => {
    expect(
      presentQuickMenuEntries([cmd("a:x", false), sep, cmd("b:y", true), sep, cmd("c:z", false)])
    ).toEqual([cmd("a:x", false), sep, cmd("c:z", false)]);
  });

  it("returns [] when every command is disabled", () => {
    expect(presentQuickMenuEntries([cmd("a:x", true), sep, cmd("b:y", true)])).toEqual([]);
  });

  it("returns an all-available list unchanged", () => {
    const list = [cmd("a:x", false), sep, cmd("b:y", false)];
    expect(presentQuickMenuEntries(list)).toEqual(list);
  });
});
```

- [ ] **Step 2: Run them — expected to FAIL**

Run: `npx vitest run tests/quickCommands.test.ts`
Expected: FAIL — `presentQuickMenuEntries` is not exported.

- [ ] **Step 3: Extract the normalizer and add `presentQuickMenuEntries`**

In `src/core/quickCommands.ts`, replace the body of `quickMenuEntries` after the `mapped` declaration — i.e. everything from `const out: QuickMenuEntry[] = [];` through `return out.some((e) => e.kind === "command") ? out : [];` — with:

```ts
  return normalizeSeparators(mapped);
```

and add below `quickMenuEntries` (module-private helper + new export):

```ts
// Shared separator discipline: no leading/trailing/consecutive dividers, and a list
// holding no command collapses to [].
function normalizeSeparators(list: QuickMenuEntry[]): QuickMenuEntry[] {
  const out: QuickMenuEntry[] = [];
  for (const e of list) {
    if (e.kind === "separator") {
      const last = out[out.length - 1];
      if (last === undefined) continue; // no leading separator
      if (last.kind === "separator") continue; // collapse consecutive
    }
    out.push(e);
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last === undefined || last.kind !== "separator") break;
    out.pop(); // no trailing separator
  }
  return out.some((e) => e.kind === "command") ? out : [];
}

// What the ribbon popup actually shows: commands missing on this device are dropped
// (settings keeps their greyed rows), and separators orphaned by the removal re-normalize.
export function presentQuickMenuEntries(entries: QuickMenuEntry[]): QuickMenuEntry[] {
  return normalizeSeparators(entries.filter((e) => e.kind === "separator" || !e.disabled));
}
```

- [ ] **Step 4: Run the tests — expected to PASS, whole suite green**

Run: `npx vitest run tests/quickCommands.test.ts`
Expected: all pass, including the untouched `quickMenuEntries` cases (extraction is behavior-preserving).

- [ ] **Step 5: Wire `openMenu`**

In `src/main.ts` line 4, change the import to:

```ts
import { presentQuickMenuEntries, quickMenuEntries } from "./core/quickCommands";
```

In `openMenu` (~line 914), replace:

```ts
    const entries = quickMenuEntries(quickMenu.entries, (id) => id in commands.commands);
```

with:

```ts
    // The popup shows only what's runnable here; settings keeps the greyed full list.
    const entries = presentQuickMenuEntries(quickMenuEntries(quickMenu.entries, (id) => id in commands.commands));
```

and in the entry-rendering loop, replace:

```ts
        if (e.disabled) i.setDisabled(true);
        else i.onClick(() => commands.executeCommandById(e.commandId));
```

with:

```ts
        i.onClick(() => commands.executeCommandById(e.commandId)); // presented rows are always runnable
```

The empty-placeholder branch above the loop stays as is — it now also covers a menu whose commands all vanished since the last rebuild (record-only copy mismatch, accepted in the spec).

- [ ] **Step 6: GUIDE sentence**

In `docs/GUIDE.md` line 17, replace the sentence:

`a command not installed on this device is greyed out and recovers automatically once its plugin is back.`

with:

`a command not installed on this device is greyed out in settings and left out of the ribbon popup, recovering automatically once its plugin is back.`

(The following sentence about all-missing menus hiding their ribbon icon stays unchanged.)

- [ ] **Step 7: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 114 tests pass; lint clean.

- [ ] **Step 8: Leave uncommitted** (NO-COMMITS mode)

---

## Final verification (controller, after the task)

- Task review (single task, whole-change lens: `quickMenuEntries` behavior unchanged, Non-goals untouched, GUIDE voice).
- Live verify in the dev vault: a mixed menu (one missing + available commands, separators between) opens with no greyed row and no leading/doubled divider; settings tab still greys the missing entry; an all-available menu renders as before.
