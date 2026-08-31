import { App, ExtraButtonComponent, Setting, setIcon } from "obsidian";
import { fallbackItemName, splitStatusBarId, statusBarRowIds } from "../core/statusBarItems";
import { createPointerDragList } from "./pointerDrag";
import type { HitTest } from "./pointerDrag";
import { withScrollPreserved } from "./scrollKeep";
import { StatusBarItemModal } from "./StatusBarItemModal";
import { MODE_ICON, MODE_NAME, MODE_NEXT } from "./statusBarMode";
import type RibbonOrganizerPlugin from "../main";
import type { StatusBarSnapshotItem } from "../main";

// "Status bar" settings tab: a mobile-display toggle, a clone-based preview strip, and a
// flat drag list mirroring the status bar's final order. One order and visibility shared
// across devices: rows for ids this device doesn't have stay in place ("Not on this
// device"). Pinned rows (items that position themselves via their own CSS order) show a
// lock and are neither draggable nor drop targets; the eye still works on them.
export class StatusBarSection {
  private drag: string | null = null; // dragged row id
  private pointerDrag = createPointerDragList<string>();
  private containerEl: HTMLElement | null = null;
  // Spotlight listeners attach to FOREIGN DOM (the real status bar items); every re-render
  // must detach the previous set and strip any lingering spot class.
  private spotCleanups: (() => void)[] = [];

  constructor(
    private app: App,
    private plugin: RibbonOrganizerPlugin
  ) {}

  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    withScrollPreserved(containerEl, () => this.renderContent(containerEl));
  }

  // Detaches the spotlight listeners from the REAL status bar elements and strips any
  // lingering spot class. Idempotent. Called on every re-render, on tab switches, and when
  // the settings tab hides — the real bar outlives the settings DOM, so render-time cleanup
  // alone would leave hover listeners toggling the accent outline during normal vault use.
  teardown(): void {
    for (const cleanup of this.spotCleanups) cleanup();
    this.spotCleanups = [];
  }

  private renderContent(containerEl: HTMLElement): void {
    this.teardown();
    this.pointerDrag = createPointerDragList<string>();
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

    new Setting(containerEl)
      .setName("Tablet style")
      .setDesc("How the bar sits on tablets: a floating pill above the corner, or docked flush in the corner like on desktop. Phones always use the pill above the toolbar.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("pill", "Floating pill")
          .addOption("docked", "Docked in the corner")
          .setValue(this.plugin.settings.statusBarTabletStyle)
          .onChange((value) => {
            this.plugin.settings.statusBarTabletStyle = value === "docked" ? "docked" : "pill";
            void this.plugin.saveSettings().then(() => this.plugin.applyMobileStatusBarClass());
          })
      );

    containerEl.createDiv({
      cls: "ribbon-organizer-tab-desc",
      text: "Drag to reorder the status bar; the eye hides an item everywhere. The same order and visibility apply on every device; items a device doesn't have are skipped there.",
    });

    const snapshot = this.plugin.statusBarSnapshot();
    if (snapshot === null) {
      containerEl.createDiv({ cls: "ribbon-organizer-rg-note", text: "Status bar tools don't work on this Obsidian version — the bar is left untouched. Check for a plugin update." });
      return;
    }
    const liveEls = this.plugin.statusBarLiveElements();
    const clones = this.renderStrip(containerEl, snapshot, liveEls);

    const liveById = new Map(snapshot.map((i) => [i.id, i]));
    const rowIds = statusBarRowIds(this.plugin.settings.statusBarOrder, snapshot.map((i) => i.id));
    // Rows sharing a key need an ordinal so two "Git" rows stay tellable apart.
    const keyCounts = new Map<string, number>();
    for (const id of rowIds) {
      const { key } = splitStatusBarId(id);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-sb-list" });
    rowIds.forEach((id) => this.renderRow(listEl, id, rowIds, liveById.get(id), keyCounts, clones.get(id), liveEls.get(id)));

    // The hint doubles as the append drop target — insert-before alone cannot reach the end.
    const hint = containerEl.createDiv({ cls: "ribbon-organizer-sb-hint", text: "New items appear at the end." });
    this.wireDrop(hint, (draggedId) => {
      const out = rowIds.filter((r) => r !== draggedId);
      out.push(draggedId);
      this.persist(out);
    });
  }

  // A static, pixel-faithful mirror of the bar: clones of the visible live elements carry
  // their classes (theme/plugin CSS matches) and inline order; a pinned spacer clone keeps
  // its own order/flex-grow, so even the left/right split previews correctly. Clones are
  // inert: ids stripped (no duplicate DOM ids — quick-explorer nests one), listeners are
  // not copied by cloneNode, and the strip is aria-hidden.
  private renderStrip(
    containerEl: HTMLElement,
    snapshot: StatusBarSnapshotItem[],
    liveEls: Map<string, HTMLElement>
  ): Map<string, HTMLElement> {
    containerEl.createDiv({ cls: "ribbon-organizer-sb-strip-label", text: "Preview · hover a row or an item to locate it" });
    const strip = containerEl.createDiv({ cls: "status-bar ribbon-organizer-sb-strip", attr: { "aria-hidden": "true" } });
    const clones = new Map<string, HTMLElement>();
    for (const item of snapshot) {
      if (item.hidden || !item.shown) continue;
      const el = liveEls.get(item.id);
      if (el === undefined) continue;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      for (const idEl of Array.from(clone.querySelectorAll("[id]"))) idEl.removeAttribute("id");
      strip.appendChild(clone);
      clones.set(item.id, clone);
    }
    return clones;
  }

  private renderRow(
    listEl: HTMLElement,
    id: string,
    rowIds: string[],
    live: StatusBarSnapshotItem | undefined,
    keyCounts: Map<string, number>,
    clone: HTMLElement | undefined,
    liveEl: HTMLElement | undefined
  ): void {
    const { key, index } = splitStatusBarId(id);
    const pinned = live?.pinned === true;
    const row = listEl.createDiv({ cls: "ribbon-organizer-sb-item", attr: pinned ? {} : { draggable: "true" } });
    if (live === undefined) row.addClass("is-missing");
    if (live?.hidden === true) row.addClass("is-hidden");
    const grip = row.createSpan({ cls: pinned ? "ribbon-organizer-sb-lock" : "ribbon-organizer-rg-grip" });
    setIcon(grip, pinned ? "lock" : "grip-vertical");
    // Absent rows keep their grip (they still sort); `help` marks the absence in the icon slot.
    if (live === undefined) setIcon(row.createSpan({ cls: "ribbon-organizer-rg-icon" }), "help");
    const title = row.createSpan({ cls: "ribbon-organizer-sb-title", text: this.displayName(key, liveEl) });
    if ((keyCounts.get(key) ?? 0) > 1) title.createSpan({ cls: "ribbon-organizer-sb-ordinal", text: ` · ${String(index + 1)}` });
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-sb-missing", text: "Not on this device" });
    else if (pinned) row.createSpan({ cls: "ribbon-organizer-sb-pintag", text: "Keeps its own position" });
    else if (!live.hidden && !live.shown) row.createSpan({ cls: "ribbon-organizer-sb-notshown", text: "Not shown right now" });
    else if (live.textDisplayed !== "") row.createSpan({ cls: "ribbon-organizer-sb-preview", text: live.textDisplayed });
    row.createSpan({ cls: "ribbon-organizer-rg-plugin", text: key });
    if (live !== undefined) {
      const btns = row.createDiv({ cls: "ribbon-organizer-rg-btns" });
      if (live.hasText) {
        const wand = new ExtraButtonComponent(btns)
          .setIcon("wand-2")
          .setTooltip("Customize how it shows")
          .onClick(() => {
            new StatusBarItemModal(this.app, this.plugin, id, this.displayName(key, liveEl), () => {
              if (this.containerEl !== null) this.render(this.containerEl);
            }).open();
          });
        wand.extraSettingsEl.toggleClass("is-rules-on", live.ruleCount > 0);
      }
      const modeBtn = new ExtraButtonComponent(btns)
        .setIcon(MODE_ICON[live.mode])
        .setTooltip(`Display: ${MODE_NAME[live.mode]} — click for ${MODE_NAME[MODE_NEXT[live.mode]]}`)
        .onClick(() => {
          void this.plugin.setStatusBarItemMode(id, MODE_NEXT[live.mode]).then(() => {
            if (this.containerEl !== null) this.render(this.containerEl);
          });
        });
      modeBtn.extraSettingsEl.toggleClass("is-mode-on", live.mode !== "full");
      const eye = new ExtraButtonComponent(btns)
        .setIcon(live.hidden ? "eye-off" : "eye")
        .setTooltip(live.hidden ? "Show this item" : "Hide this item")
        .onClick(() => {
          void this.plugin.setStatusBarItemHidden(id, !live.hidden).then(() => {
            if (this.containerEl !== null) this.render(this.containerEl);
          });
        });
      eye.extraSettingsEl.toggleClass("is-eye-off", live.hidden);
    }

    // Spotlight: hidden items have no visible body, missing items no body at all.
    if (live !== undefined && !live.hidden && live.shown) this.wireSpot(row, clone, liveEl);

    if (pinned) return; // pinned rows neither drag nor accept drops (their span is a lock, never a wired grip)
    this.pointerDrag.wireHandle(grip, row, id);
    row.addEventListener("dragstart", (e) => {
      this.drag = id;
      e.dataTransfer?.setData("text/plain", ""); // some platforms refuse to start a drag without data
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    this.wireRowDrop(row, id, rowIds);
  }

  // Three-way hover: entering the row, its strip clone, or the real bar item highlights the
  // other parties.
  private wireSpot(row: HTMLElement, clone: HTMLElement | undefined, liveEl: HTMLElement | undefined): void {
    const targets = [clone, liveEl].filter((t): t is HTMLElement => t !== undefined);
    if (targets.length === 0) return;
    const on = (): void => {
      row.addClass("is-hovered");
      for (const t of targets) t.addClass("ribbon-organizer-sb-spot");
    };
    const off = (): void => {
      row.removeClass("is-hovered");
      for (const t of targets) t.removeClass("ribbon-organizer-sb-spot");
    };
    const sources = [row, ...targets];
    for (const src of sources) {
      src.addEventListener("mouseenter", on);
      src.addEventListener("mouseleave", off);
    }
    this.spotCleanups.push(() => {
      off();
      for (const src of sources) {
        src.removeEventListener("mouseenter", on);
        src.removeEventListener("mouseleave", off);
      }
    });
  }

  private displayName(key: string, liveEl?: HTMLElement): string {
    const manifests = (this.app as unknown as { plugins?: { manifests?: Record<string, { name?: unknown }> } }).plugins?.manifests;
    const name = manifests?.[key]?.name;
    if (typeof name === "string") return name;
    // Fallback-keyed items (no plugin-<id> class — Commander macros, generic-class ids): the
    // element's own accessible name ("Change vault") beats a humanized class string
    // ("Clickable icon").
    const aria = liveEl?.getAttribute("aria-label")?.trim() ?? "";
    return aria !== "" ? aria : fallbackItemName(key);
  }

  // The hitAt closure carries the target's whole drop behavior; the HTML5 listeners and the
  // pointer path both resolve through it.
  private wireDrop(el: HTMLElement, onDrop: (draggedId: string) => void): void {
    const hitAt: HitTest<string> = (draggedId) => ({ cls: "is-drop-target", drop: () => onDrop(draggedId) });
    this.pointerDrag.wireTarget(el, hitAt);
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
      if (draggedId !== null) hitAt(draggedId, e.clientY)?.drop();
    });
  }

  // Half-zone insertion: the pointer's vertical half decides before/after, so the last
  // row's bottom half reaches the end of the list.
  private wireRowDrop(row: HTMLElement, id: string, rowIds: string[]): void {
    const hitAt: HitTest<string> = (draggedId, clientY) => {
      const rect = row.getBoundingClientRect();
      const zone = clientY < rect.top + rect.height / 2 ? "before" : "after";
      return {
        cls: zone === "before" ? "is-drop-before" : "is-drop-after",
        drop: (): void => {
          if (draggedId === id) return;
          const out = rowIds.filter((r) => r !== draggedId);
          let to = out.indexOf(id);
          if (to === -1) return;
          if (zone === "after") to += 1;
          out.splice(to, 0, draggedId);
          this.persist(out);
        },
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
    row.addEventListener("dragend", () => {
      this.drag = null;
      clear();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      clear();
      const draggedId = this.drag;
      this.drag = null;
      if (draggedId !== null) hitAt(draggedId, e.clientY)?.drop();
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
