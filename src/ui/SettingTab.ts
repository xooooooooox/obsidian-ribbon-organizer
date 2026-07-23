import { App, ButtonComponent, ExtraButtonComponent, PluginSettingTab, setIcon } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { isSeparator } from "../core/types";
import { CommandSelectModal } from "./CommandSelectModal";
import { GroupsSection } from "./GroupsSection";
import { IconSelectModal } from "./IconSelectModal";
import { renderIcon } from "./iconRender";
import type RibbonOrganizerPlugin from "../main";

type PanelTab = "groups" | "commands";

const TABS: { id: PanelTab; label: string; icon: string }[] = [
  { id: "groups", label: "Ribbon groups", icon: "rows-3" },
  { id: "commands", label: "Quick commands", icon: "menu" },
];

export class RibbonOrganizerSettingTab extends PluginSettingTab {
  private groupsSection: GroupsSection;
  private activeTab: PanelTab = "groups";
  private tabbedEl: HTMLElement | null = null;

  constructor(app: App, private plugin: RibbonOrganizerPlugin) {
    super(app, plugin);
    this.groupsSection = new GroupsSection(app, plugin);
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
    else this.renderQuickCommands(body);
  }

  private renderQuickCommands(containerEl: HTMLElement): void {
    containerEl.empty();
    containerEl.createDiv({
      cls: "ribbon-organizer-tab-desc",
      text: "Commands shown in the Ribbon Organizer menu. A command not installed on this device is greyed out.",
    });

    const registry = (this.app as unknown as { commands: { commands: Record<string, { icon?: string }> } }).commands.commands;
    const list = this.plugin.settings.quickCommands;
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-qc-list" });

    const persist = (): void => {
      void (async () => {
        await this.plugin.saveSettings();
        this.renderQuickCommands(containerEl); // section re-renders in place; outer scroller untouched
      })();
    };
    const move = (idx: number, delta: number): void => {
      const a = list[idx];
      const b = list[idx + delta];
      if (a === undefined || b === undefined) return;
      list[idx + delta] = a;
      list[idx] = b;
      persist();
    };
    const reorderButtons = (row: HTMLElement, idx: number): void => {
      const btns = row.createDiv({ cls: "ribbon-organizer-qc-btns" });
      new ExtraButtonComponent(btns).setIcon("chevron-up").setTooltip("Move up").setDisabled(idx === 0).onClick(() => move(idx, -1));
      new ExtraButtonComponent(btns).setIcon("chevron-down").setTooltip("Move down").setDisabled(idx === list.length - 1).onClick(() => move(idx, 1));
      new ExtraButtonComponent(btns).setIcon("trash").setTooltip("Remove").onClick(() => {
        list.splice(idx, 1);
        persist();
      });
    };

    list.forEach((entry, idx) => {
      if (isSeparator(entry)) {
        const row = listEl.createDiv({ cls: "ribbon-organizer-qc-seprow" });
        row.createDiv({ cls: "ribbon-organizer-qc-sepline" });
        row.createSpan({ cls: "ribbon-organizer-qc-septxt", text: "Separator" });
        row.createDiv({ cls: "ribbon-organizer-qc-sepline" });
        reorderButtons(row, idx);
        return;
      }
      const missing = !(entry.commandId in registry);
      const row = listEl.createDiv({ cls: "ribbon-organizer-qc-row" });
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

    const addbar = containerEl.createDiv({ cls: "ribbon-organizer-qc-addbar" });
    new ButtonComponent(addbar).setButtonText("Add command").setCta().onClick(() => {
      new CommandSelectModal(this.app, (cmd) => {
        list.push({ commandId: cmd.id, label: cmd.name, icon: cmd.icon ?? "command" });
        persist();
      }).open();
    });
    new ButtonComponent(addbar).setButtonText("Add separator").onClick(() => {
      list.push({ kind: "separator" });
      persist();
    });
  }
}
