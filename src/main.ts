import { App, Menu, Notice, Platform, Plugin } from "obsidian";
import { quickMenuEntries } from "./core/quickCommands";
import { RibbonGroup, computeRibbonLayout, defaultGroups, normalizeGroups } from "./core/ribbonGroups";
import { QuickEntry } from "./core/types";
import { renderIcon } from "./ui/iconRender";
import { RibbonOrganizerSettingTab } from "./ui/SettingTab";

interface RibbonOrganizerSettings {
  quickCommands: QuickEntry[]; // commands + separators surfaced in the ribbon menu
  groups: RibbonGroup[];       // top-to-bottom ribbon group order (includes the ungrouped sentinel)
}

const DEFAULT_SETTINGS: RibbonOrganizerSettings = {
  quickCommands: [],
  groups: defaultGroups(),
};

// A live left-ribbon icon as exposed to the settings UI.
export interface RibbonSnapshotItem {
  id: string;    // registration id: "pluginId:title"
  title: string;
  icon: string;
  hidden: boolean;
}

interface RibbonInternalItem {
  id: string;
  title: string;
  icon: string;
  hidden: boolean;
  buttonEl: HTMLElement;
}

interface RibbonInternals {
  items: RibbonInternalItem[];
  ribbonItemsEl: HTMLElement;
}

// Undocumented internals: leftRibbon.items entries carry the registration id, the button
// element, and the native-hide flag; ribbonItemsEl is the .side-dock-actions flex-column
// container (flex `order` therefore fully controls visual sequence). Shape is validated at
// runtime — null means "these internals changed; do not touch the ribbon".
function ribbonInternals(app: App): RibbonInternals | null {
  const ribbon = (app.workspace as unknown as { leftRibbon?: { items?: unknown; ribbonItemsEl?: unknown } }).leftRibbon;
  if (ribbon === undefined || !Array.isArray(ribbon.items) || !(ribbon.ribbonItemsEl instanceof HTMLElement)) return null;
  const items: RibbonInternalItem[] = [];
  for (const raw of ribbon.items) {
    const it = raw as { id?: unknown; title?: unknown; icon?: unknown; hidden?: unknown; buttonEl?: unknown };
    if (typeof it.id !== "string" || !(it.buttonEl instanceof HTMLElement)) return null;
    items.push({
      id: it.id,
      title: typeof it.title === "string" ? it.title : it.id,
      icon: typeof it.icon === "string" ? it.icon : "",
      hidden: it.hidden === true,
      buttonEl: it.buttonEl,
    });
  }
  return { items, ribbonItemsEl: ribbon.ribbonItemsEl };
}

export default class RibbonOrganizerPlugin extends Plugin {
  settings: RibbonOrganizerSettings = DEFAULT_SETTINGS;
  private ribbonObserver: MutationObserver | null = null;
  private applyTimer: number | null = null;
  private groupingDisabled = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addRibbonIcon("menu", "Ribbon Organizer", (evt) => this.openMenu(evt));
    this.addSettingTab(new RibbonOrganizerSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.applyGrouping());
  }

  onunload(): void {
    this.ribbonObserver?.disconnect();
    this.ribbonObserver = null;
    if (this.applyTimer !== null) window.clearTimeout(this.applyTimer);
    const internals = ribbonInternals(this.app);
    if (internals === null) return;
    for (const item of internals.items) item.buttonEl.style.order = "";
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider"))) el.remove();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<RibbonOrganizerSettings> | null);
    this.settings.quickCommands = [...this.settings.quickCommands]; // never alias DEFAULT_SETTINGS' array
    this.settings.groups = normalizeGroups(this.settings.groups);   // validates + always a fresh array
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // The settings UI's view of the live ribbon; null when the private internals changed shape.
  ribbonSnapshot(): RibbonSnapshotItem[] | null {
    const internals = ribbonInternals(this.app);
    if (internals === null) return null;
    return internals.items.map(({ id, title, icon, hidden }) => ({ id, title, icon, hidden }));
  }

  // Applies the configured grouping to the desktop left ribbon: flex order per icon plus one
  // divider element between adjacent non-empty groups. Idempotent; safe to call repeatedly.
  applyGrouping(): void {
    if (!Platform.isDesktop || this.groupingDisabled) return;
    const internals = ribbonInternals(this.app);
    if (internals === null) {
      this.groupingDisabled = true;
      console.error("Ribbon Organizer: app.workspace.leftRibbon does not match the expected shape; ribbon grouping is disabled for this session");
      new Notice("Ribbon Organizer: ribbon grouping is incompatible with this Obsidian version.");
      return;
    }
    // Disconnect while we write so our own DOM edits cannot re-trigger the observer.
    this.ribbonObserver?.disconnect();
    const layout = computeRibbonLayout(this.settings.groups, internals.items);
    for (const item of internals.items) {
      const order = layout.orders.get(item.id);
      item.buttonEl.style.order = order === undefined ? "" : String(order);
    }
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider"))) el.remove();
    for (const dividerOrder of layout.dividerOrders) {
      internals.ribbonItemsEl.createDiv({ cls: "ribbon-organizer-divider" }).style.order = String(dividerOrder);
    }
    this.observeRibbon(internals.ribbonItemsEl);
  }

  // Re-applies (debounced) when icons are added/removed (late-loading plugins) or native
  // hide/unhide toggles a class. Reconnected after every apply; disconnected on unload.
  private observeRibbon(ribbonItemsEl: HTMLElement): void {
    if (this.ribbonObserver === null) {
      this.ribbonObserver = new MutationObserver(() => {
        if (this.applyTimer !== null) window.clearTimeout(this.applyTimer);
        this.applyTimer = window.setTimeout(() => {
          this.applyTimer = null;
          this.applyGrouping();
        }, 100);
      });
    }
    this.ribbonObserver.observe(ribbonItemsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  private openMenu(evt: MouseEvent): void {
    const menu = new Menu();
    // Force a DOM menu: on macOS (nativeMenus default) this would render as a native OS menu,
    // which cannot show the built-in or iconize command icons. DOM mode renders them; no-op on
    // mobile, where menus are already DOM.
    menu.setUseNativeMenu(false);
    const commands = (this.app as unknown as {
      commands: { commands: Record<string, { icon?: string }>; executeCommandById: (id: string) => void };
    }).commands;
    const entries = quickMenuEntries(this.settings.quickCommands, (id) => id in commands.commands);
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
}
