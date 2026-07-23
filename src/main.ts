import { Menu, Plugin } from "obsidian";
import { quickMenuEntries } from "./core/quickCommands";
import { QuickEntry } from "./core/types";
import { renderIcon } from "./ui/iconRender";
import { RibbonOrganizerSettingTab } from "./ui/SettingTab";

interface RibbonOrganizerSettings {
  quickCommands: QuickEntry[]; // commands + separators surfaced in the ribbon menu
}

const DEFAULT_SETTINGS: RibbonOrganizerSettings = {
  quickCommands: [],
};

export default class RibbonOrganizerPlugin extends Plugin {
  settings: RibbonOrganizerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addRibbonIcon("menu", "Ribbon Organizer", (evt) => this.openMenu(evt));
    this.addSettingTab(new RibbonOrganizerSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<RibbonOrganizerSettings> | null);
    this.settings.quickCommands = [...this.settings.quickCommands]; // never alias DEFAULT_SETTINGS' array
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
