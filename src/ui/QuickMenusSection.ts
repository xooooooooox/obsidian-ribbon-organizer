import { App, ButtonComponent, ExtraButtonComponent, setIcon } from "obsidian";
import { commandOwnerId } from "../core/quickCommands";
import { uniqueMenuName } from "../core/quickMenus";
import { QuickEntry, QuickMenu, isSeparator } from "../core/types";
import { CommandSelectModal } from "./CommandSelectModal";
import { IconSelectModal } from "./IconSelectModal";
import { renderIcon } from "./iconRender";
import { createPointerDragList } from "./pointerDrag";
import type { HitTest } from "./pointerDrag";
import { withScrollPreserved } from "./scrollKeep";
import type RibbonOrganizerPlugin from "../main";

type EntryRef = { menuId: string; index: number };

// "Quick menus" settings section: one collapsible section per menu (same collapse pattern
// as GroupsSection — default collapsed, session-only expanded set, a new menu starts expanded).
// One instance lives on the SettingTab so collapse state survives re-renders; after every
// structural edit the section re-renders itself into its own container. Menu-level changes
// (add/delete/rename/icon) additionally rebuild the ribbon icons via plugin.syncRibbonMenus().
export class QuickMenusSection {
  private expanded = new Set<string>(); // menu ids; empty = all collapsed (session-only)
  private containerEl: HTMLElement | null = null;
  private drag: EntryRef | null = null;
  private pointerDrag = createPointerDragList<EntryRef>();

  constructor(
    private app: App,
    private plugin: RibbonOrganizerPlugin
  ) {}

  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    withScrollPreserved(containerEl, () => this.renderContent(containerEl));
  }

  private renderContent(containerEl: HTMLElement): void {
    this.pointerDrag = createPointerDragList<EntryRef>();
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
        icon: "ribbon-organizer",
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
    const nameEl = hdr.createSpan({ cls: "ribbon-organizer-qm-name", text: menu.name });
    // Click the name to rename in place (same interaction as the Ribbon tab's group names).
    // stopPropagation keeps the click from toggling the collapse.
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.startRename(nameEl, menu);
    });
    const commandCount = menu.entries.filter((e) => !isSeparator(e)).length;
    hdr.createSpan({ cls: "ribbon-organizer-rg-count", text: String(commandCount) });
    const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
    new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete menu (removes its ribbon icon)").onClick(() => {
      this.expanded.delete(menu.id);
      this.plugin.settings.menus = this.plugin.settings.menus.filter((m) => m.id !== menu.id);
      this.persistAndSync();
    });
    const body = listEl.createDiv({ cls: "ribbon-organizer-qm-body" });
    body.toggleClass("is-collapsed", !this.expanded.has(menu.id));
    this.renderEntries(body, menu);
    // Click toggles collapse; ignore the icon button, the transient rename input, and the
    // buttons area (the name span stops its own clicks — they start a rename instead).
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
    // Entry dropped on a menu header: append to that menu's end — the own header included.
    // Works while collapsed, no expand (same semantics as GroupsSection's group headers).
    this.wireDropInto(hdr, (from) => {
      const moved = this.takeEntry(from);
      if (moved === null) return;
      menu.entries.push(moved);
      this.persist();
    });
  }

  // In-place rename: the name span swaps for an input; Enter commits, Escape restores, blur
  // commits. Empty and duplicate names revert (names must stay unique: they are the ribbon
  // ids) — the re-render restores the name span either way.
  private startRename(nameEl: HTMLElement, menu: QuickMenu): void {
    const input = createEl("input", { cls: "ribbon-organizer-rg-rename", attr: { type: "text", "aria-label": "Menu name" } });
    input.value = menu.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.value = menu.name;
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const name = input.value.trim();
      const taken = this.plugin.settings.menus.some((m) => m.id !== menu.id && m.name === name);
      if (name === "" || taken || name === menu.name) {
        if (this.containerEl !== null) this.render(this.containerEl);
        return;
      }
      menu.name = name;
      this.persistAndSync();
    });
  }

  // Removes and returns the dragged entry from its source menu; null if the source vanished.
  private takeEntry(from: EntryRef): QuickEntry | null {
    const src = this.plugin.settings.menus.find((m) => m.id === from.menuId);
    const moved = src?.entries.splice(from.index, 1)[0];
    return moved ?? null;
  }

  // Insert relative to the target row: upper half = before, lower half = after; same-menu
  // moves account for the removal shifting later indexes.
  private dropOnRow(from: EntryRef, menu: QuickMenu, index: number, zone: "before" | "after"): void {
    let to = index + (zone === "after" ? 1 : 0);
    if (from.menuId === menu.id && from.index < to) to -= 1;
    if (from.menuId === menu.id && from.index === to) return;
    const moved = this.takeEntry(from);
    if (moved === null) return;
    menu.entries.splice(to, 0, moved);
    this.persist();
  }

  // Menu headers are append-to-end targets: whole-frame highlight, no insert position.
  // The hitAt closure carries the target's whole drop behavior; the HTML5 listeners and the
  // pointer path both resolve through it.
  private wireDropInto(el: HTMLElement, onDrop: (from: EntryRef) => void): void {
    const hitAt: HitTest<EntryRef> = (from) => ({ cls: "ribbon-organizer-is-drop-into", drop: () => onDrop(from) });
    this.pointerDrag.wireTarget(el, hitAt);
    el.addEventListener("dragover", (e) => {
      if (this.drag === null) return;
      e.preventDefault();
      el.addClass("ribbon-organizer-is-drop-into");
    });
    el.addEventListener("dragleave", () => el.removeClass("ribbon-organizer-is-drop-into"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.removeClass("ribbon-organizer-is-drop-into");
      const from = this.drag;
      this.drag = null;
      if (from !== null) hitAt(from, e.clientY)?.drop();
    });
  }

  // Half-zone insertion on entry rows (same semantics and visuals as the Status bar tab):
  // the pointer's vertical half decides before/after, so the last row's bottom half reaches
  // the end of the list.
  private wireRowDrop(row: HTMLElement, menu: QuickMenu, index: number): void {
    const hitAt: HitTest<EntryRef> = (from, clientY) => {
      const rect = row.getBoundingClientRect();
      const zone = clientY < rect.top + rect.height / 2 ? "before" : "after";
      return {
        cls: zone === "before" ? "is-drop-before" : "is-drop-after",
        drop: () => this.dropOnRow(from, menu, index, zone),
      };
    };
    this.pointerDrag.wireTarget(row, hitAt);
    const clear = (): void => {
      row.removeClass("is-drop-before");
      row.removeClass("is-drop-after");
    };
    row.addEventListener("dragover", (e) => {
      if (this.drag === null) return;
      const hit = hitAt(this.drag, e.clientY);
      if (hit === null) return;
      e.preventDefault();
      row.toggleClass("is-drop-before", hit.cls === "is-drop-before");
      row.toggleClass("is-drop-after", hit.cls === "is-drop-after");
    });
    row.addEventListener("dragleave", clear);
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      clear();
      const from = this.drag;
      this.drag = null;
      if (from !== null) hitAt(from, e.clientY)?.drop();
    });
  }

  private renderEntries(body: HTMLElement, menu: QuickMenu): void {
    const registry = (this.app as unknown as { commands: { commands: Record<string, { icon?: string; name?: unknown }> } }).commands.commands;
    const list = menu.entries;
    // The grip is the drag handle: rows hold a label input, so a fully draggable row would
    // fight text selection; setDragImage keeps the whole row as the drag ghost.
    const wireDrag = (row: HTMLElement, idx: number): void => {
      const grip = row.createSpan({ cls: "ribbon-organizer-rg-grip", attr: { draggable: "true" } });
      setIcon(grip, "grip-vertical");
      this.pointerDrag.wireHandle(grip, row, { menuId: menu.id, index: idx });
      grip.addEventListener("dragstart", (e) => {
        this.drag = { menuId: menu.id, index: idx };
        e.dataTransfer?.setData("text/plain", ""); // some platforms refuse to start a drag without data
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setDragImage(row, 12, 12);
        }
      });
      // dragend fires on the drag source only — clear state and any highlight stranded by a
      // cancelled drag (Escape while hovering a target never fires that target's dragleave).
      grip.addEventListener("dragend", () => {
        this.drag = null;
        if (this.containerEl !== null) {
          const classes = ["is-drop-before", "is-drop-after", "ribbon-organizer-is-drop-into"];
          for (const el of Array.from(this.containerEl.querySelectorAll(classes.map((c) => `.${c}`).join(", "))))
            el.classList.remove(...classes);
        }
      });
      this.wireRowDrop(row, menu, idx);
    };
    const removeButton = (row: HTMLElement, idx: number, tooltip: string): void => {
      const rowBtns = row.createDiv({ cls: "ribbon-organizer-qc-btns" });
      new ExtraButtonComponent(rowBtns).setIcon("trash-2").setTooltip(tooltip).onClick(() => {
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
        removeButton(row, idx, "Remove separator");
        return;
      }
      const missing = !(entry.commandId in registry);
      const row = body.createDiv({ cls: "ribbon-organizer-qc-row" });
      if (missing) row.addClass("is-missing");
      wireDrag(row, idx);
      const iconBtn = row.createEl("button", { cls: "ribbon-organizer-qc-icon", attr: { "aria-label": "Change icon" } });
      const paint = (id: string): void => renderIcon(iconBtn, id, registry[entry.commandId]?.icon, this.app);
      // Absent commands mark the absence in the icon slot; the stored icon returns with the command.
      if (missing) setIcon(iconBtn, "help");
      else paint(entry.icon);
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
      if (missing) row.createSpan({ cls: "ribbon-organizer-qc-missing", text: "Not on this device" });
      // The owning plugin stays visible however the label is edited; the hover tooltip
      // carries the command's registered name and the exact id.
      const cmdName = registry[entry.commandId]?.name;
      row.createSpan({
        cls: "ribbon-organizer-qc-plugin",
        text: this.pluginName(commandOwnerId(entry.commandId)),
        attr: { "aria-label": typeof cmdName === "string" ? `${cmdName} · ${entry.commandId}` : entry.commandId },
      });
      removeButton(row, idx, "Remove command");
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

  // The display name of the plugin owning a command id prefix: manifest name when the prefix
  // is an installed plugin, "Obsidian" for core namespaces (editor:, workspace:, app:, …) —
  // same manifests read as StatusBarSection's row names.
  private pluginName(ownerId: string): string {
    const manifests = (this.app as unknown as { plugins?: { manifests?: Record<string, { name?: unknown }> } }).plugins?.manifests;
    const name = manifests?.[ownerId]?.name;
    return typeof name === "string" ? name : "Obsidian";
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
