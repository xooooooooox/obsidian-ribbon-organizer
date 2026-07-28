import { App, Setting, setIcon } from "obsidian";
import { fallbackItemName, splitStatusBarId, statusBarRowIds } from "../core/statusBarItems";
import { withScrollPreserved } from "./scrollKeep";
import type RibbonOrganizerPlugin from "../main";
import type { StatusBarSnapshotItem } from "../main";

// "Status bar" settings tab: a mobile-display toggle plus a flat drag list mirroring the
// status bar's final order. One order shared across devices: rows for ids this device
// doesn't have stay in place ("Not on this device") so a drag here never evicts them.
export class StatusBarSection {
  private drag: string | null = null; // dragged row id
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
      text: "Drag to reorder the status bar. The same order applies on every device; items a device doesn't have are skipped there.",
    });

    const snapshot = this.plugin.statusBarSnapshot();
    if (snapshot === null) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Status bar ordering is incompatible with this Obsidian version." });
      return;
    }
    const liveById = new Map(snapshot.map((i) => [i.id, i]));
    const rowIds = statusBarRowIds(this.plugin.settings.statusBarOrder, snapshot.map((i) => i.id));
    // Rows sharing a key need an ordinal so two "Git" rows stay tellable apart.
    const keyCounts = new Map<string, number>();
    for (const id of rowIds) {
      const { key } = splitStatusBarId(id);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-sb-list" });
    rowIds.forEach((id) => this.renderRow(listEl, id, rowIds, liveById.get(id), keyCounts));

    // The hint doubles as the append drop target — insert-before alone cannot reach the end.
    const hint = containerEl.createDiv({ cls: "ribbon-organizer-sb-hint", text: "New items appear at the end." });
    this.wireDrop(hint, (draggedId) => {
      const out = rowIds.filter((r) => r !== draggedId);
      out.push(draggedId);
      this.persist(out);
    });
  }

  private renderRow(
    listEl: HTMLElement,
    id: string,
    rowIds: string[],
    live: StatusBarSnapshotItem | undefined,
    keyCounts: Map<string, number>
  ): void {
    const { key, index } = splitStatusBarId(id);
    const row = listEl.createDiv({ cls: "ribbon-organizer-sb-item", attr: { draggable: "true" } });
    if (live === undefined) row.addClass("is-missing");
    const grip = row.createSpan({ cls: "ribbon-organizer-rg-grip" });
    setIcon(grip, live === undefined ? "help" : "grip-vertical");
    const title = row.createSpan({ cls: "ribbon-organizer-sb-title", text: this.displayName(key) });
    if ((keyCounts.get(key) ?? 0) > 1) title.createSpan({ cls: "ribbon-organizer-sb-ordinal", text: ` · ${String(index + 1)}` });
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-sb-missing", text: "Not on this device" });
    else if (live.text !== "") row.createSpan({ cls: "ribbon-organizer-sb-preview", text: live.text });
    row.createSpan({ cls: "ribbon-organizer-rg-plugin", text: key });

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
