import { App, Menu, Notice, Platform, Plugin } from "obsidian";
import { CmdrHideLists, cmdrHideStyleText, withTitle } from "./core/commanderHide";
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

interface CmdrPlugin {
  settings: { hide: CmdrHideLists };
  saveSettings: () => Promise<void>;
}

// Commander in three states: absent (not installed / disabled — app.plugins.plugins only
// holds enabled instances), ok (shape validated), broken (present but its settings changed shape).
type CmdrAccess = { state: "absent" } | { state: "ok"; plugin: CmdrPlugin } | { state: "broken" };

function cmdrAccess(app: App): CmdrAccess {
  const cmdr = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins?.["cmdr"];
  if (cmdr === undefined || cmdr === null) return { state: "absent" };
  const c = cmdr as { settings?: { hide?: { leftRibbon?: unknown; statusbar?: unknown } }; saveSettings?: unknown };
  if (!Array.isArray(c.settings?.hide?.leftRibbon) || !Array.isArray(c.settings?.hide?.statusbar) || typeof c.saveSettings !== "function") {
    return { state: "broken" };
  }
  return { state: "ok", plugin: cmdr as CmdrPlugin };
}

// Replaces Commander's injected stylesheet exactly the way Commander itself does
// (remove #cmdr, append only when the text is non-empty). The rebuild is TOTAL and assumes
// Commander's two hide surfaces (leftRibbon + statusbar); a future surface would be dropped
// until Commander's own next save.
function rebuildCmdrStyle(hide: CmdrHideLists): void {
  document.head.querySelector("style#cmdr")?.remove();
  const text = cmdrHideStyleText(hide);
  if (text !== "") document.head.appendChild(createEl("style", { attr: { id: "cmdr" }, text, type: "text/css" }));
}

export default class RibbonOrganizerPlugin extends Plugin {
  settings: RibbonOrganizerSettings = { menus: defaultMenus(), groups: defaultGroups() };
  private menuIcons: { name: string; el: HTMLElement }[] = [];
  private ribbonObserver: MutationObserver | null = null;
  private applyTimer: number | null = null;
  private groupingDisabled = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.syncRibbonMenus();
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
    const raw = ((await this.loadData()) ?? {}) as { menus?: unknown; quickCommands?: unknown; groups?: unknown };
    this.settings = {
      menus: normalizeMenus(raw.menus, raw.quickCommands), // pre-0.4.0 quickCommands migrates to one menu
      groups: normalizeGroups(raw.groups ?? defaultGroups()),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // Titles Commander currently hides; empty when Commander is absent or unreadable.
  private cmdrHiddenTitles(): Set<string> {
    const access = cmdrAccess(this.app);
    if (access.state !== "ok") return new Set();
    return new Set(access.plugin.settings.hide.leftRibbon.filter((t): t is string => typeof t === "string"));
  }

  // The settings UI's view of the live ribbon; null when the private internals changed shape.
  ribbonSnapshot(): RibbonSnapshotItem[] | null {
    const internals = ribbonInternals(this.app);
    if (internals === null) return null;
    const cmdrHidden = this.cmdrHiddenTitles();
    // hidden is the EFFECTIVE state: Obsidian's native flag OR Commander's title list.
    return internals.items.map(({ id, title, icon, hidden }) => ({ id, title, icon, hidden: hidden || cmdrHidden.has(title) }));
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
    const cmdrHidden = this.cmdrHiddenTitles();
    const layout = computeRibbonLayout(
      this.settings.groups,
      internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title) }))
    );
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

  // One switch over both hide layers (spec 定稿 2026-07-23): hiding sets Obsidian's native flag
  // AND adds the title to Commander's list; showing clears both — a single still-set layer
  // would keep the icon hidden and make the toggle look broken. Commander absent → native only.
  async setIconHidden(itemId: string, hidden: boolean): Promise<void> {
    const ribbon = (this.app.workspace as unknown as { leftRibbon?: { items?: unknown; onChange?: unknown } }).leftRibbon;
    const items = ribbon !== undefined && Array.isArray(ribbon.items) ? (ribbon.items as { id?: unknown; title?: unknown; hidden?: unknown }[]) : null;
    const raw = items?.find((it) => it.id === itemId);
    if (raw === undefined) return; // icon no longer live; the stale row disappears on the next render
    if (typeof ribbon?.onChange === "function") {
      raw.hidden = hidden;
      // Native path (verified in the dev vault 2026-07-23): onChange toggles every buttonEl,
      // rebuilds the ribbon children (setChildrenInPlace drops our dividers) and persists via
      // requestSaveLayout — hence the applyGrouping right after.
      (ribbon.onChange as (persist: boolean) => void).call(ribbon, true);
      this.applyGrouping();
    } else {
      console.error("Ribbon Organizer: leftRibbon.onChange is missing; the native hide flag was not changed");
      new Notice("Ribbon Organizer: cannot toggle the native hide on this Obsidian version.");
    }
    const title = typeof raw.title === "string" ? raw.title : itemId.slice(itemId.indexOf(":") + 1);
    const access = cmdrAccess(this.app);
    if (access.state === "absent") return;
    if (access.state === "broken") {
      console.error("Ribbon Organizer: Commander settings do not match the expected shape; changed the native hide only");
      new Notice("Ribbon Organizer: Commander settings look unexpected — changed the native hide only.");
      return;
    }
    access.plugin.settings.hide.leftRibbon = withTitle(access.plugin.settings.hide.leftRibbon, title, hidden);
    await access.plugin.saveSettings();
    rebuildCmdrStyle(access.plugin.settings.hide);
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
}
