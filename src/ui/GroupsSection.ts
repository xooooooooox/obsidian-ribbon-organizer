import { App, ButtonComponent, ExtraButtonComponent, Menu, setIcon } from "obsidian";
import {
  RibbonGroup,
  UNGROUPED_ID,
  addGroup,
  deleteGroup,
  moveGroup,
  moveItemToGroup,
  renameGroup,
} from "../core/ribbonGroups";
import { renderIcon } from "./iconRender";
import { withScrollPreserved } from "./scrollKeep";
import type RibbonOrganizerPlugin from "../main";
import type { RibbonSnapshotItem } from "../main";

type DragPayload =
  | { type: "group"; groupId: string }
  | { type: "item"; itemId: string; fromGroupId: string; fromIndex: number };

// "Ribbon groups" settings section: a single column mirroring the ribbon's final order —
// group header rows mark where dividers render, item rows drag within/across groups, the
// ungrouped sentinel is the default landing bucket. One instance lives on the SettingTab so
// the filter text survives re-renders; after every edit the section re-renders itself into
// its own container, with the outer scroller's position carried across the rebuild.
export class GroupsSection {
  private filterQuery = "";
  private expanded = new Set<string>(); // group ids; empty = all collapsed (session-only, like filterQuery)
  private refreshVisibility: () => void = () => {};
  private drag: DragPayload | null = null;
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
    containerEl.createDiv({
      cls: "ribbon-organizer-tab-desc",
      text: "Order the left-ribbon icons into groups and toggle their visibility. Hiding an icon here also hides it in Obsidian and Commander; a divider renders between adjacent non-empty groups. On phones the grouping shapes the navbar ribbon menu; on tablets the drawer ribbon.",
    });

    const snapshot = this.plugin.ribbonSnapshot();
    if (snapshot === null) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Ribbon grouping is incompatible with this Obsidian version." });
      return;
    }
    const liveById = new Map(snapshot.map((i) => [i.id, i]));
    const claimed = new Set(this.plugin.settings.groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));

    const filterEl = containerEl.createEl("input", {
      cls: "ribbon-organizer-rg-filter",
      attr: { type: "search", placeholder: "Filter icons…" },
    });
    filterEl.value = this.filterQuery;

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
    // Filtering toggles row visibility in place — no re-render, so the input keeps focus.
    filterEl.addEventListener("input", () => {
      this.filterQuery = filterEl.value;
      applyFilter();
    });

    this.plugin.settings.groups.forEach((group, groupIndex) => {
      const members =
        group.id === UNGROUPED_ID
          ? snapshot.filter((i) => !claimed.has(i.id)).map((i) => ({ itemId: i.id, live: i }))
          : group.items.map((itemId) => ({ itemId, live: liveById.get(itemId) }));
      this.renderGroupHeader(listEl, group, groupIndex, members);
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

    const addbar = containerEl.createDiv({ cls: "ribbon-organizer-rg-addbar" });
    new ButtonComponent(addbar).setButtonText("New group").onClick(() => {
      const id = crypto.randomUUID();
      this.expanded.add(id); // a just-created group is immediately renamed/filled — start it expanded
      this.plugin.settings.groups = addGroup(this.plugin.settings.groups, id, "New group");
      this.persist();
    });
  }

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
      // Quick menus tab). stopPropagation keeps the click from toggling the collapse.
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.startRename(nameEl, group);
      });
      const btns = hdr.createDiv({ cls: "ribbon-organizer-rg-btns" });
      new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete group (members fall to Ungrouped)").onClick(() => {
        this.expanded.delete(group.id);
        this.plugin.settings.groups = deleteGroup(this.plugin.settings.groups, group.id);
        this.persist();
      });
    }
    // Click toggles collapse; ignore clicks in the buttons area and on the inline-rename input.
    hdr.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof Element && (t.closest(".ribbon-organizer-rg-btns") !== null || t.tagName === "INPUT")) return;
      if (this.expanded.has(group.id)) this.expanded.delete(group.id);
      else this.expanded.add(group.id);
      setIcon(chevron, this.expanded.has(group.id) ? "chevron-down" : "chevron-right");
      this.refreshVisibility();
    });
    hdr.addEventListener("dragstart", (e) => this.onDragStart(e, { type: "group", groupId: group.id }));
    this.wireDropTarget(hdr, (payload) => {
      if (payload.type === "group") {
        if (payload.groupId === group.id) return;
        // Insert before this header; account for the source's removal shifting later indexes.
        const from = this.plugin.settings.groups.findIndex((g) => g.id === payload.groupId);
        const to = from !== -1 && from < groupIndex ? groupIndex - 1 : groupIndex;
        this.plugin.settings.groups = moveGroup(this.plugin.settings.groups, payload.groupId, to);
        this.persist();
        return;
      }
      // Item dropped on a header: append to that group (for the sentinel: just un-claim).
      this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, payload.itemId, group.id);
      this.persist();
    });
  }

  private renderItemRow(
    listEl: HTMLElement,
    group: RibbonGroup,
    itemId: string,
    live: RibbonSnapshotItem | undefined,
    memberIndex: number
  ): HTMLElement {
    const row = listEl.createDiv({ cls: "ribbon-organizer-rg-item", attr: { draggable: "true" } });
    if (live === undefined) row.addClass("is-missing");
    if (live?.hidden === true) row.addClass("is-hidden");
    const grip = row.createSpan({ cls: "ribbon-organizer-rg-grip" });
    setIcon(grip, "grip-vertical");
    const iconEl = row.createSpan({ cls: "ribbon-organizer-rg-icon" });
    if (live !== undefined) renderIcon(iconEl, live.icon, undefined, this.app);
    else setIcon(iconEl, "help");
    row.createSpan({ cls: "ribbon-organizer-rg-title", text: live?.title ?? itemId });
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-rg-missing", text: "Not on this device" });
    row.createSpan({ cls: "ribbon-organizer-rg-plugin", text: itemId.split(":")[0] ?? "" });
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
    more.onClick(() => {
      const menu = new Menu();
      for (const target of this.plugin.settings.groups) {
        if (target.id === group.id) continue;
        menu.addItem((mi) =>
          mi.setTitle(`Move to ${target.name}`).onClick(() => {
            this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, itemId, target.id);
            this.persist();
          })
        );
      }
      const rect = more.extraSettingsEl.getBoundingClientRect();
      menu.showAtPosition({ x: rect.right, y: rect.bottom });
    });

    row.addEventListener("dragstart", (e) => this.onDragStart(e, { type: "item", itemId, fromGroupId: group.id, fromIndex: memberIndex }));
    this.wireDropTarget(row, (payload) => {
      if (payload.type === "group") return; // groups drop on headers only
      if (group.id === UNGROUPED_ID) {
        if (payload.fromGroupId === UNGROUPED_ID) return; // reorder within ungrouped is a no-op (live order rules)
        this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, payload.itemId, UNGROUPED_ID);
        this.persist();
        return;
      }
      // Insert before this row; same-group downward moves shift by one after removal.
      let to = memberIndex;
      if (payload.fromGroupId === group.id && payload.fromIndex < memberIndex) to -= 1;
      if (payload.fromGroupId === group.id && payload.fromIndex === to) return;
      this.plugin.settings.groups = moveItemToGroup(this.plugin.settings.groups, payload.itemId, group.id, to);
      this.persist();
    });
    return row;
  }

  private startRename(nameEl: HTMLElement, group: RibbonGroup): void {
    const input = createEl("input", { cls: "ribbon-organizer-rg-rename", attr: { type: "text" } });
    input.value = group.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.value = group.name;
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const name = input.value.trim();
      if (name !== "" && name !== group.name) {
        this.plugin.settings.groups = renameGroup(this.plugin.settings.groups, group.id, name);
      }
      this.persist(); // re-render restores the name span even when unchanged
    });
  }

  private onDragStart(e: DragEvent, payload: DragPayload): void {
    this.drag = payload;
    e.dataTransfer?.setData("text/plain", ""); // some platforms refuse to start a drag without data
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  private wireDropTarget(el: HTMLElement, onDrop: (payload: DragPayload) => void): void {
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
      const payload = this.drag;
      this.drag = null;
      if (payload !== null) onDrop(payload);
    });
  }

  private persist(): void {
    void (async () => {
      await this.plugin.saveSettings();
      this.plugin.applyGrouping();
      if (this.containerEl !== null) this.render(this.containerEl);
    })();
  }
}
