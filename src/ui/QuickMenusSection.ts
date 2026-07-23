import { App, ButtonComponent, ExtraButtonComponent, setIcon } from "obsidian";
import { uniqueMenuName } from "../core/quickMenus";
import { QuickEntry, QuickMenu, isSeparator } from "../core/types";
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
  private drag: { menuId: string; index: number } | null = null;

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
    // Entry dropped on a menu header: append to that menu's end — the own header included,
    // which is the only way to drag an entry to the last slot of its own menu. Works while
    // collapsed, no expand (same semantics as GroupsSection's group headers).
    this.wireDropTarget(hdr, (from) => {
      const moved = this.takeEntry(from);
      if (moved === null) return;
      menu.entries.push(moved);
      this.persist();
    });
  }

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
      // dragend fires on the drag source only — clear state and any highlight stranded by a
      // cancelled drag (Escape while hovering a target never fires that target's dragleave).
      grip.addEventListener("dragend", () => {
        this.drag = null;
        if (this.containerEl !== null) {
          for (const el of Array.from(this.containerEl.querySelectorAll(".is-drop-target"))) el.classList.remove("is-drop-target");
        }
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
