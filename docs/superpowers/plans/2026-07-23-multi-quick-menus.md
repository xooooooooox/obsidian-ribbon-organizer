# Multiple Quick Menus Implementation Plan (0.4.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded composite ribbon icon with multiple user-defined quick menus — each menu is one ribbon icon with editable icon and name, opening its own command list.

**Architecture:** New pure core module `core/quickMenus.ts` (normalize + legacy migration, unit-tested). `main.ts` gains `syncRibbonMenus()` — a full remove-and-re-register rebuild of the plugin's ribbon icons; visual position is unaffected because grouping controls it via flex `order`. The settings Quick commands tab moves out of `SettingTab` into a new `ui/QuickMenusSection.ts` with one collapsible section per menu (GroupsSection collapse pattern).

**Tech Stack:** TypeScript, esbuild, vitest, eslint-plugin-obsidianmd preset.

Spec: `docs/superpowers/specs/2026-07-23-multi-quick-menus-design.md`

## Global Constraints

- **NO GIT COMMITS.** Leave all changes uncommitted (the working tree is the user's review state). Never add Claude/AI attribution anywhere.
- Gates after each code task: `npm run build` (exit 0), `npm test` (all pass — 23 existing + the new `tests/quickMenus.test.ts`), `npm run lint` (**0 problems** — repo baseline).
- Lint preset forbids ALL inline `eslint-disable` comments. Fix code, never disable.
- All UI copy in English, sentence case.
- `src/core/` stays free of `obsidian` imports (it is the unit-tested layer).
- Behavior contract (from spec): menu names unique and non-empty (UI reverts bad renames; load-time normalize suffixes duplicates `" 2"`, `" 3"`, …); empty menu keeps its ribbon icon and shows the disabled "No commands configured — add them in the plugin settings" item; zero menus is valid (no icons); legacy `quickCommands` (any array, including empty) migrates to one menu `{ name: "Ribbon Organizer", icon: "menu" }`; fresh install defaults to that same single empty menu; menu sections default collapsed with session-only expanded set, new menu starts expanded; deleting a menu needs no confirmation; no menu reordering; no filter box in the commands tab.

---

### Task 1: Core — `QuickMenu` type, `core/quickMenus.ts`, unit tests

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/quickMenus.ts`
- Test: `tests/quickMenus.test.ts`

**Interfaces:**
- Consumes: `QuickEntry` from `src/core/types.ts` (unchanged).
- Produces (Task 2 relies on these exact signatures):
  - `interface QuickMenu { id: string; name: string; icon: string; entries: QuickEntry[] }` (in `core/types.ts`)
  - `defaultMenus(): QuickMenu[]`
  - `normalizeMenus(menusRaw: unknown, legacyQuickCommands: unknown): QuickMenu[]`
  - `uniqueMenuName(base: string, taken: string[]): string`

- [ ] **Step 1: Add the `QuickMenu` interface**

In `src/core/types.ts`, append after the `isSeparator` function:

```ts

// A user-defined ribbon menu: one composite ribbon icon opening its own command list
// (see core/quickMenus.ts). The ribbon item id derives from `name` ("ribbon-organizer:<name>"),
// so `id` is the stable settings identity that survives renames.
export interface QuickMenu {
  id: string;            // uuid, assigned at creation
  name: string;          // ribbon tooltip; unique among menus
  icon: string;          // lucide id; editable via the icon picker
  entries: QuickEntry[]; // commands + separators
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/quickMenus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultMenus, normalizeMenus, uniqueMenuName } from "../src/core/quickMenus";

describe("normalizeMenus", () => {
  it("returns the default single menu when nothing is stored", () => {
    const out = normalizeMenus(undefined, undefined);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ribbon Organizer", icon: "menu", entries: [] });
    expect(out[0]?.id).toBeTruthy();
  });

  it("migrates a legacy quickCommands list into the first menu", () => {
    const legacy = [{ commandId: "a:x", label: "X", icon: "cloud" }, { kind: "separator" }];
    const out = normalizeMenus(undefined, legacy);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ribbon Organizer", icon: "menu" });
    expect(out[0]?.entries).toEqual(legacy);
  });

  it("migrates an empty legacy list to one empty menu", () => {
    const out = normalizeMenus(undefined, []);
    expect(out).toHaveLength(1);
    expect(out[0]?.entries).toEqual([]);
  });

  it("keeps zero menus when the user deleted them all", () => {
    expect(normalizeMenus([], [{ commandId: "a:x", label: "X", icon: "i" }])).toEqual([]);
  });

  it("fills missing ids and drops malformed menus and entries", () => {
    const out = normalizeMenus(
      [
        { name: "Good", icon: "zap", entries: [{ commandId: "a:x", label: "X", icon: "i" }, { bogus: true }, { kind: "separator" }] },
        { name: "  ", icon: "zap", entries: [] }, // blank name: dropped
        { icon: "zap", entries: [] },             // no name: dropped
        { name: "NoIcon", entries: [] },          // no icon: dropped
        "junk",
      ],
      undefined
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBeTruthy();
    expect(out[0]?.entries).toEqual([{ commandId: "a:x", label: "X", icon: "i" }, { kind: "separator" }]);
  });

  it("treats a non-array entries field as empty", () => {
    const out = normalizeMenus([{ name: "M", icon: "i", entries: "junk" }], undefined);
    expect(out[0]?.entries).toEqual([]);
  });

  it("suffixes duplicate names deterministically", () => {
    const out = normalizeMenus(
      [
        { id: "1", name: "Menu", icon: "a", entries: [] },
        { id: "2", name: "Menu", icon: "b", entries: [] },
        { id: "3", name: "Menu", icon: "c", entries: [] },
      ],
      undefined
    );
    expect(out.map((m) => m.name)).toEqual(["Menu", "Menu 2", "Menu 3"]);
  });

  it("preserves stored ids", () => {
    const out = normalizeMenus([{ id: "keep-me", name: "M", icon: "i", entries: [] }], undefined);
    expect(out[0]?.id).toBe("keep-me");
  });
});

describe("uniqueMenuName", () => {
  it("returns the base when free", () => {
    expect(uniqueMenuName("New menu", [])).toBe("New menu");
  });

  it("suffixes past every taken name", () => {
    expect(uniqueMenuName("New menu", ["New menu", "New menu 2"])).toBe("New menu 3");
  });
});

describe("defaultMenus", () => {
  it("is one empty Ribbon Organizer menu", () => {
    const out = defaultMenus();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ribbon Organizer", icon: "menu", entries: [] });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tests/quickMenus.test.ts` cannot resolve `../src/core/quickMenus`. The 23 existing tests still pass.

- [ ] **Step 4: Implement `src/core/quickMenus.ts`**

```ts
import { QuickEntry, QuickMenu } from "./types";

// The quick-menus model: validation of persisted data (defensive read of our own data.json —
// malformed menus/entries are dropped, missing ids filled, duplicate names suffixed) and the
// pre-0.4.0 migration (a single flat `quickCommands` list becomes the first menu). Obsidian-free.

export function defaultMenus(): QuickMenu[] {
  return [{ id: crypto.randomUUID(), name: "Ribbon Organizer", icon: "menu", entries: [] }];
}

// First free name among `taken`: base, then "base 2", "base 3", …
export function uniqueMenuName(base: string, taken: string[]): string {
  const set = new Set(taken);
  let name = base;
  for (let n = 2; set.has(name); n++) name = `${base} ${n}`;
  return name;
}

export function normalizeMenus(menusRaw: unknown, legacyQuickCommands: unknown): QuickMenu[] {
  if (Array.isArray(menusRaw)) {
    const out: QuickMenu[] = [];
    const taken: string[] = [];
    for (const raw of menusRaw) {
      const m = raw as { id?: unknown; name?: unknown; icon?: unknown; entries?: unknown };
      if (typeof m.name !== "string" || m.name.trim() === "" || typeof m.icon !== "string") continue;
      const name = uniqueMenuName(m.name, taken);
      taken.push(name);
      out.push({
        id: typeof m.id === "string" && m.id !== "" ? m.id : crypto.randomUUID(),
        name,
        icon: m.icon,
        entries: normalizeEntries(m.entries),
      });
    }
    return out;
  }
  if (Array.isArray(legacyQuickCommands)) {
    return [{ id: crypto.randomUUID(), name: "Ribbon Organizer", icon: "menu", entries: normalizeEntries(legacyQuickCommands) }];
  }
  return defaultMenus();
}

function normalizeEntries(raw: unknown): QuickEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickEntry[] = [];
  for (const e of raw) {
    const c = e as { kind?: unknown; commandId?: unknown; label?: unknown; icon?: unknown };
    if (c.kind === "separator") {
      out.push({ kind: "separator" });
      continue;
    }
    if (typeof c.commandId === "string" && typeof c.label === "string" && typeof c.icon === "string") {
      out.push({ commandId: c.commandId, label: c.label, icon: c.icon });
    }
  }
  return out;
}
```

- [ ] **Step 5: Gates**

Run: `npm test` — Expected: all pass (23 existing + 11 new = 34).
Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: no output (0 problems).

Do NOT commit.

---

### Task 2: Integration — ribbon lifecycle in `main.ts`, `ui/QuickMenusSection.ts`, `SettingTab` delegation, CSS

**Files:**
- Modify: `src/main.ts`
- Create: `src/ui/QuickMenusSection.ts`
- Modify: `src/ui/SettingTab.ts` (delete `renderQuickCommands`, delegate to the new section)
- Modify: `styles.css`

**Interfaces:**
- Consumes (from Task 1): `QuickMenu` from `../core/types`; `defaultMenus()`, `normalizeMenus(menusRaw, legacyQuickCommands)`, `uniqueMenuName(base, taken)` from `../core/quickMenus`.
- Produces: `RibbonOrganizerPlugin.syncRibbonMenus(): void` (public — called by `QuickMenusSection`); settings shape `{ menus: QuickMenu[]; groups: RibbonGroup[] }`.

- [ ] **Step 1: `main.ts` — imports, settings shape, defaults**

Replace the import block's first four lines and the settings interface/defaults (`main.ts` lines 1–16) with:

```ts
import { App, Menu, Notice, Platform, Plugin } from "obsidian";
import { quickMenuEntries } from "./core/quickCommands";
import { defaultMenus, normalizeMenus } from "./core/quickMenus";
import { RibbonGroup, computeRibbonLayout, defaultGroups, normalizeGroups } from "./core/ribbonGroups";
import { QuickMenu } from "./core/types";
import { renderIcon } from "./ui/iconRender";
import { RibbonOrganizerSettingTab } from "./ui/SettingTab";

interface RibbonOrganizerSettings {
  menus: QuickMenu[];    // user-defined ribbon menus: one composite ribbon icon each
  groups: RibbonGroup[]; // top-to-bottom ribbon group order (includes the ungrouped sentinel)
}
```

Delete the `const DEFAULT_SETTINGS … ;` block entirely (defaults now come from the factories, so nothing can alias a module-level array).

- [ ] **Step 2: `main.ts` — class fields, onload, loadSettings**

Replace the `settings` field initializer and add the tracking field:

```ts
  settings: RibbonOrganizerSettings = { menus: defaultMenus(), groups: defaultGroups() };
  private menuIcons: { name: string; el: HTMLElement }[] = [];
```

In `onload()`, replace the line
`this.addRibbonIcon("menu", "Ribbon Organizer", (evt) => this.openMenu(evt));`
with:

```ts
    this.syncRibbonMenus();
```

Replace `loadSettings()`:

```ts
  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as { menus?: unknown; quickCommands?: unknown; groups?: unknown };
    this.settings = {
      menus: normalizeMenus(raw.menus, raw.quickCommands), // pre-0.4.0 quickCommands migrates to one menu
      groups: normalizeGroups(raw.groups ?? defaultGroups()),
    };
  }
```

(The stale `quickCommands` key disappears on the next `saveSettings()`.)

- [ ] **Step 3: `main.ts` — `syncRibbonMenus()` and parameterized `openMenu`**

Add `syncRibbonMenus` as a public method (place it right above `openMenu`):

```ts
  // Rebuilds this plugin's composite ribbon icons from settings: every previously registered
  // icon is removed (DOM element plus its leftRibbon.items entry when the internals are
  // readable — with unreadable internals grouping is disabled anyway, so DOM removal alone
  // suffices), then all menus re-register. Re-registration appends at the ribbon's end, but
  // grouping controls visual position via flex order, so a full rebuild is invisible.
  syncRibbonMenus(): void {
    const ribbon = (this.app.workspace as unknown as { leftRibbon?: { items?: unknown } }).leftRibbon;
    const items = ribbon !== undefined && Array.isArray(ribbon.items) ? (ribbon.items as { id?: unknown }[]) : null;
    for (const registered of this.menuIcons) {
      registered.el.remove();
      if (items !== null) {
        const idx = items.findIndex((it) => it.id === `${this.manifest.id}:${registered.name}`);
        if (idx !== -1) items.splice(idx, 1);
      }
    }
    this.menuIcons = [];
    for (const menu of this.settings.menus) {
      const el = this.addRibbonIcon(menu.icon, menu.name, (evt) => this.openMenu(evt, menu.id));
      this.menuIcons.push({ name: menu.name, el });
    }
    // During onload the layout isn't ready yet; the onLayoutReady hook applies grouping then.
    if (this.app.workspace.layoutReady) this.applyGrouping();
  }
```

Replace `openMenu` with the parameterized version (body identical to today except the lookup and the `quickMenu.entries` source):

```ts
  private openMenu(evt: MouseEvent, menuId: string): void {
    const quickMenu = this.settings.menus.find((m) => m.id === menuId);
    if (quickMenu === undefined) return; // deleted since registration; syncRibbonMenus already removed the icon
    const menu = new Menu();
    // Force a DOM menu: on macOS (nativeMenus default) this would render as a native OS menu,
    // which cannot show the built-in or iconize command icons. DOM mode renders them; no-op on
    // mobile, where menus are already DOM.
    menu.setUseNativeMenu(false);
    const commands = (this.app as unknown as {
      commands: { commands: Record<string, { icon?: string }>; executeCommandById: (id: string) => void };
    }).commands;
    const entries = quickMenuEntries(quickMenu.entries, (id) => id in commands.commands);
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
```

`onunload()` stays unchanged (Obsidian removes registered ribbon icons on unload).

- [ ] **Step 4: Create `src/ui/QuickMenusSection.ts`**

```ts
import { App, ButtonComponent, ExtraButtonComponent, setIcon } from "obsidian";
import { uniqueMenuName } from "../core/quickMenus";
import { QuickMenu, isSeparator } from "../core/types";
import { CommandSelectModal } from "./CommandSelectModal";
import { IconSelectModal } from "./IconSelectModal";
import { renderIcon } from "./iconRender";
import type RibbonOrganizerPlugin from "../main";

// "Quick commands" settings section: one collapsible section per menu (same collapse pattern
// as GroupsSection — default collapsed, session-only expanded set, a new menu starts expanded).
// One instance lives on the SettingTab so collapse state survives re-renders; after every
// structural edit the section re-renders itself into its own container. Menu-level changes
// (add/delete/rename/icon) additionally rebuild the ribbon icons via plugin.syncRibbonMenus().
export class QuickMenusSection {
  private expanded = new Set<string>(); // menu ids; empty = all collapsed (session-only)
  private containerEl: HTMLElement | null = null;

  constructor(
    private app: App,
    private plugin: RibbonOrganizerPlugin
  ) {}

  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    containerEl.empty();
    containerEl.createDiv({
      cls: "ribbon-organizer-tab-desc",
      text: "Each menu is one ribbon icon opening its own command list. A command not installed on this device is greyed out.",
    });
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-qm-list" });
    for (const menu of this.plugin.settings.menus) this.renderMenuSection(listEl, menu);
    const addbar = containerEl.createDiv({ cls: "ribbon-organizer-qc-addbar" });
    new ButtonComponent(addbar).setButtonText("New menu").onClick(() => {
      const menu: QuickMenu = {
        id: crypto.randomUUID(),
        name: uniqueMenuName("New menu", this.plugin.settings.menus.map((m) => m.name)),
        icon: "menu",
        entries: [],
      };
      this.expanded.add(menu.id); // a just-created menu is immediately renamed/filled — start it expanded
      this.plugin.settings.menus.push(menu);
      this.persistAndSync();
    });
  }

  private renderMenuSection(listEl: HTMLElement, menu: QuickMenu): void {
    const hdr = listEl.createDiv({ cls: "ribbon-organizer-qm-hdr" });
    const chevron = hdr.createSpan({ cls: "ribbon-organizer-rg-chevron" });
    setIcon(chevron, this.expanded.has(menu.id) ? "chevron-down" : "chevron-right");
    const iconBtn = hdr.createEl("button", { cls: "ribbon-organizer-qc-icon", attr: { "aria-label": "Change menu icon" } });
    renderIcon(iconBtn, menu.icon, undefined, this.app);
    iconBtn.onclick = (): void => {
      new IconSelectModal(this.app, (icon) => {
        menu.icon = icon;
        this.persistAndSync();
      }).open();
    };
    const nameInput = hdr.createEl("input", { cls: "ribbon-organizer-qm-name", attr: { type: "text", "aria-label": "Menu name" } });
    nameInput.value = menu.name;
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nameInput.blur();
      if (e.key === "Escape") {
        nameInput.value = menu.name;
        nameInput.blur();
      }
    });
    nameInput.addEventListener("blur", () => {
      const name = nameInput.value.trim();
      const taken = this.plugin.settings.menus.some((m) => m.id !== menu.id && m.name === name);
      if (name === "" || taken || name === menu.name) {
        nameInput.value = menu.name; // empty and duplicate names revert (names must stay unique: they are the ribbon ids)
        return;
      }
      menu.name = name;
      this.persistAndSync();
    });
    const commandCount = menu.entries.filter((e) => !isSeparator(e)).length;
    hdr.createSpan({ cls: "ribbon-organizer-rg-count", text: `· ${commandCount}` });
    const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
    new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete menu (removes its ribbon icon)").onClick(() => {
      this.expanded.delete(menu.id);
      this.plugin.settings.menus = this.plugin.settings.menus.filter((m) => m.id !== menu.id);
      this.persistAndSync();
    });
    const body = listEl.createDiv({ cls: "ribbon-organizer-qm-body" });
    body.toggleClass("is-collapsed", !this.expanded.has(menu.id));
    this.renderEntries(body, menu);
    // Click toggles collapse; ignore the icon button, the name input, and the buttons area.
    hdr.addEventListener("click", (e) => {
      const t = e.target;
      if (
        t instanceof Element &&
        (t.closest(".ribbon-organizer-rg-btns") !== null || t.closest(".ribbon-organizer-qc-icon") !== null || t.tagName === "INPUT")
      )
        return;
      if (this.expanded.has(menu.id)) this.expanded.delete(menu.id);
      else this.expanded.add(menu.id);
      setIcon(chevron, this.expanded.has(menu.id) ? "chevron-down" : "chevron-right");
      body.toggleClass("is-collapsed", !this.expanded.has(menu.id));
    });
  }

  private renderEntries(body: HTMLElement, menu: QuickMenu): void {
    const registry = (this.app as unknown as { commands: { commands: Record<string, { icon?: string }> } }).commands.commands;
    const list = menu.entries;
    const move = (idx: number, delta: number): void => {
      const a = list[idx];
      const b = list[idx + delta];
      if (a === undefined || b === undefined) return;
      list[idx + delta] = a;
      list[idx] = b;
      this.persist();
    };
    const reorderButtons = (row: HTMLElement, idx: number): void => {
      const rowBtns = row.createDiv({ cls: "ribbon-organizer-qc-btns" });
      new ExtraButtonComponent(rowBtns).setIcon("chevron-up").setTooltip("Move up").setDisabled(idx === 0).onClick(() => move(idx, -1));
      new ExtraButtonComponent(rowBtns).setIcon("chevron-down").setTooltip("Move down").setDisabled(idx === list.length - 1).onClick(() => move(idx, 1));
      new ExtraButtonComponent(rowBtns).setIcon("trash").setTooltip("Remove").onClick(() => {
        list.splice(idx, 1);
        this.persist();
      });
    };

    list.forEach((entry, idx) => {
      if (isSeparator(entry)) {
        const row = body.createDiv({ cls: "ribbon-organizer-qc-seprow" });
        row.createDiv({ cls: "ribbon-organizer-qc-sepline" });
        row.createSpan({ cls: "ribbon-organizer-qc-septxt", text: "Separator" });
        row.createDiv({ cls: "ribbon-organizer-qc-sepline" });
        reorderButtons(row, idx);
        return;
      }
      const missing = !(entry.commandId in registry);
      const row = body.createDiv({ cls: "ribbon-organizer-qc-row" });
      if (missing) row.addClass("is-missing");
      const iconBtn = row.createEl("button", { cls: "ribbon-organizer-qc-icon", attr: { "aria-label": "Change icon" } });
      const paint = (id: string): void => renderIcon(iconBtn, id, registry[entry.commandId]?.icon, this.app);
      paint(entry.icon);
      iconBtn.onclick = (): void => {
        new IconSelectModal(this.app, (icon) => {
          entry.icon = icon;
          paint(icon);
          void this.plugin.saveSettings();
        }).open();
      };
      const meta = row.createDiv({ cls: "ribbon-organizer-qc-meta" });
      const input = meta.createEl("input", { cls: "ribbon-organizer-qc-label", attr: { type: "text", placeholder: "Label" } });
      input.value = entry.label;
      // Inline edit, no rerender, so the input keeps focus while typing.
      input.addEventListener("input", () => {
        entry.label = input.value.trim() || entry.commandId;
        void this.plugin.saveSettings();
      });
      // ★ Spec: no command-id line; only a hint when the command is missing on this device.
      if (missing) meta.createDiv({ cls: "ribbon-organizer-qc-missing", text: "Not on this device" });
      reorderButtons(row, idx);
    });

    const addbar = body.createDiv({ cls: "ribbon-organizer-qc-addbar" });
    new ButtonComponent(addbar).setButtonText("Add command").setCta().onClick(() => {
      new CommandSelectModal(this.app, (cmd) => {
        list.push({ commandId: cmd.id, label: cmd.name, icon: cmd.icon ?? "command" });
        this.persist();
      }).open();
    });
    new ButtonComponent(addbar).setButtonText("Add separator").onClick(() => {
      list.push({ kind: "separator" });
      this.persist();
    });
  }

  // Entry-level changes: save + re-render this section (the ribbon icons are unaffected).
  private persist(): void {
    void (async () => {
      await this.plugin.saveSettings();
      if (this.containerEl !== null) this.render(this.containerEl);
    })();
  }

  // Menu-level changes (add/delete/rename/icon): additionally rebuild the ribbon icons.
  private persistAndSync(): void {
    void (async () => {
      await this.plugin.saveSettings();
      this.plugin.syncRibbonMenus();
      if (this.containerEl !== null) this.render(this.containerEl);
    })();
  }
}
```

- [ ] **Step 5: `src/ui/SettingTab.ts` — delegate the commands tab**

Replace the whole file with:

```ts
import { App, PluginSettingTab, setIcon } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { GroupsSection } from "./GroupsSection";
import { QuickMenusSection } from "./QuickMenusSection";
import type RibbonOrganizerPlugin from "../main";

type PanelTab = "groups" | "commands";

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: "groups", label: "Ribbon groups", icon: "rows-3" },
  { id: "commands", label: "Quick commands", icon: "menu" },
];

export class RibbonOrganizerSettingTab extends PluginSettingTab {
  private groupsSection: GroupsSection;
  private quickMenusSection: QuickMenusSection;
  private activeTab: PanelTab = "groups";
  private tabbedEl: HTMLElement | null = null;

  constructor(app: App, private plugin: RibbonOrganizerPlugin) {
    super(app, plugin);
    this.groupsSection = new GroupsSection(app, plugin);
    this.quickMenusSection = new QuickMenusSection(app, plugin);
  }

  // Declarative shell (Obsidian 1.13+): one render-type definition whose name/desc/aliases
  // feed the settings search index; its row element is taken over by the tabbed panel, whose
  // custom interactive sections the declarative control/list types cannot express. On 1.13+
  // display() below is never called (definitions win); older versions use it instead.
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Ribbon Organizer",
        desc: "Ribbon groups and quick commands.",
        aliases: ["ribbon groups", "quick commands", "divider", "separator", "reorder", "menu"],
        render: (setting) => {
          setting.settingEl.empty();
          setting.settingEl.addClass("ribbon-organizer-section");
          this.activeTab = "groups";
          this.renderTabbed(setting.settingEl);
        },
      },
    ];
  }

  // Fallback for Obsidian < 1.13.0 (minAppVersion is 1.8.7), per the official guidance:
  // "Only implement display() as a fallback for plugins that need to support Obsidian
  // versions older than 1.13.0." Renders the same tabbed panel.
  display(): void {
    this.activeTab = "groups";
    this.renderTabbed(this.containerEl);
  }

  // Two tabs (same pattern as config-sync's settings panel): icon+label buttons with an
  // accent underline on the active one; switching re-renders the body in place.
  private renderTabbed(containerEl: HTMLElement): void {
    this.tabbedEl = containerEl;
    containerEl.empty();
    const nav = containerEl.createDiv({ cls: "ribbon-organizer-tabs" });
    for (const tab of TABS) {
      const el = nav.createEl("button", { cls: "ribbon-organizer-tab" });
      setIcon(el.createSpan({ cls: "ribbon-organizer-tab-icon" }), tab.icon);
      el.createSpan({ text: tab.label });
      if (tab.id === this.activeTab) el.addClass("is-active");
      el.addEventListener("click", () => {
        this.activeTab = tab.id;
        if (this.tabbedEl !== null) this.renderTabbed(this.tabbedEl);
      });
    }
    const body = containerEl.createDiv();
    if (this.activeTab === "groups") this.groupsSection.render(body);
    else this.quickMenusSection.render(body);
  }
}
```

- [ ] **Step 6: `styles.css`**

Delete the now-unused rule (rows are appended directly to the section body):

```css
.ribbon-organizer-qc-list { display: flex; flex-direction: column; gap: 7px; margin-bottom: 8px; }
```

Append at the end of the `/* Quick commands settings */` block (after `.ribbon-organizer-iconpick-pack`):

```css
/* Quick menus — one collapsible section per composite ribbon icon */
.ribbon-organizer-qm-list { display: flex; flex-direction: column; border: 1px solid var(--background-modifier-border);
  border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
.ribbon-organizer-qm-hdr { display: flex; align-items: center; gap: 8px; padding: 7px 10px; font-weight: 600;
  background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border); cursor: pointer; }
.ribbon-organizer-qm-hdr:first-child { border-top: none; }
.ribbon-organizer-qm-hdr .ribbon-organizer-qc-icon { width: 28px; height: 28px; --icon-size: 16px; }
.ribbon-organizer-qm-hdr .ribbon-organizer-rg-btns { margin-left: auto; }
.ribbon-organizer-qm-name { font-weight: 600; max-width: 220px; }
.ribbon-organizer-qm-body { display: flex; flex-direction: column; gap: 7px; padding: 8px 10px 10px 24px;
  border-top: 1px solid var(--background-modifier-border); }
.ribbon-organizer-qm-body.is-collapsed { display: none; }
.ribbon-organizer-qm-body .ribbon-organizer-qc-addbar { margin-bottom: 0; }
```

(`.ribbon-organizer-rg-chevron`, `.ribbon-organizer-rg-count`, and `.ribbon-organizer-rg-btns` are reused from the Ribbon groups block as-is.)

- [ ] **Step 7: Gates**

Run: `npm run build` — Expected: exit 0, no tsc errors.
Run: `npm test` — Expected: all pass (34).
Run: `npm run lint` — Expected: no output (0 problems).

Do NOT commit.

---

### Task 3: Documentation currency (README, README.zh, ARCHITECTURE)

**Files:**
- Modify: `README.md:10` (Quick commands bullet)
- Modify: `README.zh.md:10` (Quick commands bullet)
- Modify: `docs/ARCHITECTURE.md` (module map, data.json example, extension recipes)

**Interfaces:**
- Consumes: the Task 1/2 behavior (multiple menus, editable icon+name, rename-drops-group-membership, migration).
- Produces: nothing downstream.

- [ ] **Step 1: README.md bullet**

Replace the `- **Quick commands**: …` bullet (line 10) with:

```markdown
- **Quick commands**: create any number of menus — each is one ribbon icon (icon and name editable) opening its own command list. Pick any commands, give them labels and icons (including [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) custom-pack icons), group them with separators. A command not installed on the current device is greyed out and recovers automatically once its plugin is installed. Note: renaming a menu changes its ribbon id, so it falls out of its ribbon group back into Ungrouped — re-drag it to restore.
```

- [ ] **Step 2: README.zh.md bullet**

Replace the `- **Quick commands**:…` bullet (line 10) with:

```markdown
- **Quick commands**:可创建任意数量的菜单——每个菜单是一个 ribbon 图标(图标和名称均可编辑),点开各自的命令列表。挑选任意命令,为其设置标签和图标(支持 [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) 自定义图标包),并用分隔线分组。当前设备上未安装的命令会置灰显示,插件装回后自动恢复。注意:重命名菜单会改变其 ribbon id,该图标会从所在分组掉回 Ungrouped——重新拖入即可恢复。
```

- [ ] **Step 3: ARCHITECTURE.md module map**

In `docs/ARCHITECTURE.md`:

Replace the `main.ts` Settings sub-bullet (line 17):

```markdown
  - Settings: `{ menus: QuickMenu[], groups: RibbonGroup[] }`; `loadSettings()` runs `normalizeMenus` (which also migrates the pre-0.4.0 flat `quickCommands` list into one menu) and `normalizeGroups`, so a hand-edited `data.json` can never crash the plugin.
```

Replace the `openMenu()` sub-bullet (line 22):

```markdown
  - `syncRibbonMenus()` rebuilds the plugin's composite ribbon icons from `settings.menus` (full remove-and-re-register; grouping's flex `order` keeps positions stable). `openMenu(evt, menuId)` builds that menu's dropdown from `quickMenuEntries`; `menu.setUseNativeMenu(false)` forces a DOM menu because native macOS menus cannot render command/iconize icons.
```

After the `core/quickCommands.ts` bullet (line 25), insert:

```markdown
- **`core/quickMenus.ts`** — the quick-menus model: `defaultMenus`, `uniqueMenuName`, and `normalizeMenus` (validates persisted menus, fills missing ids, suffixes duplicate names, migrates the legacy flat `quickCommands` list).
```

Replace the `core/types.ts` bullet (line 27):

```markdown
- **`core/types.ts`** — `QuickCommand` / `QuickSeparator` / `QuickEntry`, the `isSeparator` guard, and `QuickMenu` (one composite ribbon icon; ribbon id derives from `name`, `id` is the stable settings identity).
```

In the `ui/SettingTab.ts` bullet (line 28), replace the final sentence "Also owns the Quick commands section (rows, reorder, icon/label editing, add bar)." with "Delegates both tabs to their section classes."

After the `ui/GroupsSection.ts` bullet (line 29), insert:

```markdown
- **`ui/QuickMenusSection.ts`** — the Quick commands tab: one collapsible section per menu (default collapsed; session-only `expanded` set; new menu starts expanded), header = chevron + icon button (icon picker) + inline name input (empty/duplicate names revert — names are the ribbon ids) + command count + delete; body = the per-entry rows (icon/label/reorder/remove, separators) and that menu's add bar. Menu-level changes call `plugin.syncRibbonMenus()`; entry-level changes only save.
```

Update the `data.json` example (lines 48–53): replace the `"quickCommands": […]` property with:

```json
  "menus": [
    {
      "id": "a41c…",
      "name": "Ribbon Organizer",
      "icon": "menu",
      "entries": [
        { "commandId": "remotely-save:start-sync", "label": "Sync now", "icon": "refresh-cw" },
        { "kind": "separator" }
      ]
    }
  ],
```

Replace the extension recipe (line 73):

```markdown
- **A new quick-entry kind**: extend the `QuickEntry` union in `core/types.ts`, teach `quickMenuEntries` its menu shape and `normalizeMenus` its persisted shape, and add its row renderer in `QuickMenusSection.renderEntries`.
```

- [ ] **Step 4: Gates**

Run: `npm run lint` — Expected: no output (markdown not linted; run to confirm nothing regressed).

Do NOT commit.

---

### Task 4 (v2 amendment): entry drag-and-drop + visible command id

**Files:**
- Modify: `src/ui/QuickMenusSection.ts`
- Modify: `styles.css`
- Modify: `docs/ARCHITECTURE.md`, `README.md`, `README.zh.md` (one bullet each)

**Interfaces:**
- Consumes: existing `QuickMenusSection` internals; `QuickEntry` from `../core/types` (add to the existing import).
- Produces: no API changes.

- [ ] **Step 1: Drag state + helpers on the class**

In `src/ui/QuickMenusSection.ts`, extend the types import to `import { QuickEntry, QuickMenu, isSeparator } from "../core/types";` and add below the `containerEl` field:

```ts
  private drag: { menuId: string; index: number } | null = null;
```

Add these three private methods (above `persist()`):

```ts
  // Removes and returns the dragged entry from its source menu; null if the source vanished.
  private takeEntry(from: { menuId: string; index: number }): QuickEntry | null {
    const src = this.plugin.settings.menus.find((m) => m.id === from.menuId);
    const moved = src?.entries.splice(from.index, 1)[0];
    return moved ?? null;
  }

  // Insert before the target row; same-menu downward moves shift by one after removal.
  private dropOnRow(from: { menuId: string; index: number }, menu: QuickMenu, index: number): void {
    let to = index;
    if (from.menuId === menu.id && from.index < index) to -= 1;
    if (from.menuId === menu.id && from.index === to) return;
    const moved = this.takeEntry(from);
    if (moved === null) return;
    menu.entries.splice(to, 0, moved);
    this.persist();
  }

  private wireDropTarget(el: HTMLElement, onDrop: (from: { menuId: string; index: number }) => void): void {
    el.addEventListener("dragover", (e) => {
      if (this.drag === null) return;
      e.preventDefault();
      el.addClass("is-drop-target");
    });
    el.addEventListener("dragleave", () => el.removeClass("is-drop-target"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.removeClass("is-drop-target");
      const from = this.drag;
      this.drag = null;
      if (from !== null) onDrop(from);
    });
  }
```

- [ ] **Step 2: Header becomes a cross-menu drop target**

In `renderMenuSection`, after the `hdr.addEventListener("click", …)` block, add:

```ts
    // Entry dropped on a menu header: append to that menu (works while collapsed, no expand).
    this.wireDropTarget(hdr, (from) => {
      if (from.menuId === menu.id) return; // same menu: reorder happens on rows
      const moved = this.takeEntry(from);
      if (moved === null) return;
      menu.entries.push(moved);
      this.persist();
    });
```

- [ ] **Step 3: Rewrite `renderEntries` — grip-handle drag, trash-only buttons, command id span**

Replace the `move` and `reorderButtons` helpers and the `list.forEach` body so the whole method reads:

```ts
  private renderEntries(body: HTMLElement, menu: QuickMenu): void {
    const registry = (this.app as unknown as { commands: { commands: Record<string, { icon?: string }> } }).commands.commands;
    const list = menu.entries;
    // The grip is the drag handle: rows hold a label input, so a fully draggable row would
    // fight text selection; setDragImage keeps the whole row as the drag ghost.
    const wireDrag = (row: HTMLElement, idx: number): void => {
      const grip = row.createSpan({ cls: "ribbon-organizer-rg-grip", attr: { draggable: "true" } });
      setIcon(grip, "grip-vertical");
      grip.addEventListener("dragstart", (e) => {
        this.drag = { menuId: menu.id, index: idx };
        e.dataTransfer?.setData("text/plain", ""); // some platforms refuse to start a drag without data
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setDragImage(row, 12, 12);
        }
      });
      grip.addEventListener("dragend", () => {
        this.drag = null;
      });
      this.wireDropTarget(row, (from) => this.dropOnRow(from, menu, idx));
    };
    const removeButton = (row: HTMLElement, idx: number): void => {
      const rowBtns = row.createDiv({ cls: "ribbon-organizer-qc-btns" });
      new ExtraButtonComponent(rowBtns).setIcon("trash").setTooltip("Remove").onClick(() => {
        list.splice(idx, 1);
        this.persist();
      });
    };

    list.forEach((entry, idx) => {
      if (isSeparator(entry)) {
        const row = body.createDiv({ cls: "ribbon-organizer-qc-seprow" });
        wireDrag(row, idx);
        row.createDiv({ cls: "ribbon-organizer-qc-sepline" });
        row.createSpan({ cls: "ribbon-organizer-qc-septxt", text: "Separator" });
        row.createDiv({ cls: "ribbon-organizer-qc-sepline" });
        removeButton(row, idx);
        return;
      }
      const missing = !(entry.commandId in registry);
      const row = body.createDiv({ cls: "ribbon-organizer-qc-row" });
      if (missing) row.addClass("is-missing");
      wireDrag(row, idx);
      const iconBtn = row.createEl("button", { cls: "ribbon-organizer-qc-icon", attr: { "aria-label": "Change icon" } });
      const paint = (id: string): void => renderIcon(iconBtn, id, registry[entry.commandId]?.icon, this.app);
      paint(entry.icon);
      iconBtn.onclick = (): void => {
        new IconSelectModal(this.app, (icon) => {
          entry.icon = icon;
          paint(icon);
          void this.plugin.saveSettings();
        }).open();
      };
      const meta = row.createDiv({ cls: "ribbon-organizer-qc-meta" });
      const input = meta.createEl("input", { cls: "ribbon-organizer-qc-label", attr: { type: "text", placeholder: "Label" } });
      input.value = entry.label;
      // Inline edit, no rerender, so the input keeps focus while typing.
      input.addEventListener("input", () => {
        entry.label = input.value.trim() || entry.commandId;
        void this.plugin.saveSettings();
      });
      if (missing) meta.createDiv({ cls: "ribbon-organizer-qc-missing", text: "Not on this device" });
      // The binding stays visible however the label is edited; hover shows a truncated id in full.
      row.createSpan({ cls: "ribbon-organizer-qc-cmdid", text: entry.commandId, attr: { title: entry.commandId } });
      removeButton(row, idx);
    });

    const addbar = body.createDiv({ cls: "ribbon-organizer-qc-addbar" });
    new ButtonComponent(addbar).setButtonText("Add command").setCta().onClick(() => {
      new CommandSelectModal(this.app, (cmd) => {
        list.push({ commandId: cmd.id, label: cmd.name, icon: cmd.icon ?? "command" });
        this.persist();
      }).open();
    });
    new ButtonComponent(addbar).setButtonText("Add separator").onClick(() => {
      list.push({ kind: "separator" });
      this.persist();
    });
  }
```

- [ ] **Step 4: CSS**

In `styles.css`, append to the `/* Quick menus — one collapsible section per composite ribbon icon */` block:

```css
.ribbon-organizer-qc-cmdid { flex: none; max-width: 12em; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: var(--font-ui-smaller); color: var(--text-faint); }
.ribbon-organizer-qc-row.is-drop-target, .ribbon-organizer-qc-seprow.is-drop-target,
.ribbon-organizer-qm-hdr.is-drop-target { box-shadow: inset 0 2px 0 var(--interactive-accent); }
```

- [ ] **Step 5: Docs**

`docs/ARCHITECTURE.md` — in the `ui/QuickMenusSection.ts` bullet, replace
`body = the per-entry rows (icon/label/reorder/remove, separators) and that menu's add bar. Menu-level changes call `plugin.syncRibbonMenus()`; entry-level changes only save.`
with
`body = the per-entry rows (icon button, label input, always-visible faint command id, trash; separators) with grip-handle drag-and-drop — drop on a row inserts before it, drop on another menu's header appends (collapsed headers accept drops) — and that menu's add bar. Menu-level changes call `plugin.syncRibbonMenus()`; entry-level changes (including drag moves) only save.`

`README.md` — in the Quick commands bullet, after "group them with separators." insert:
`Drag entries to reorder them or move them onto another menu's header; every row shows the command id it is bound to.`

`README.zh.md` — in the Quick commands bullet, after "并用分隔线分组。" insert:
`条目可拖拽排序,或拖到另一个菜单的组头上移过去;每行右侧始终显示实际绑定的命令 id。`

- [ ] **Step 6: Gates**

Run: `npm run build` — Expected: exit 0.
Run: `npm test` — Expected: all pass (34).
Run: `npm run lint` — Expected: no output.

Do NOT commit.

---

## Live verification (controller/user, dev vault — after all tasks)

`npm run smoke:install`, reload the plugin in the dev vault, then check:

- Migration: a 0.3.0-era `data.json` (flat `quickCommands`) loads as one "Ribbon Organizer" menu with the same entries; the ribbon icon behaves as before.
- New menu → icon appears immediately (empty menu shows the disabled hint); icon change and rename take effect immediately; rename drops the icon out of its ribbon group into Ungrouped.
- Delete menu → icon disappears immediately; deleting all menus leaves zero plugin icons.
- Settings tab: sections default collapsed, `· n` counts commands only, header click toggles, icon button / name input / delete do not toggle, new menu starts expanded, entry edits keep the section state.

Release (0.4.0) happens only on the user's explicit "cut".
