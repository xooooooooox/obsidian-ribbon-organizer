import { App, PluginSettingTab, setIcon } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { GroupsSection } from "./GroupsSection";
import { QuickMenusSection } from "./QuickMenusSection";
import type RibbonOrganizerPlugin from "../main";

type PanelTab = "groups" | "commands";

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: "groups", label: "Ribbon", icon: "rows-3" },
  { id: "commands", label: "Quick menus", icon: "menu" },
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
        desc: "Group and hide ribbon icons; launch commands from ribbon menus.",
        aliases: ["ribbon groups", "quick menus", "quick commands", "divider", "separator", "reorder", "menu", "hide"],
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
