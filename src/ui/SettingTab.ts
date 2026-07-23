import { App, ButtonComponent, ExtraButtonComponent, PluginSettingTab, Setting } from "obsidian";
import { isSeparator } from "../core/types";
import { CommandSelectModal } from "./CommandSelectModal";
import { IconSelectModal } from "./IconSelectModal";
import { renderIcon } from "./iconRender";
import type RibbonOrganizerPlugin from "../main";

export class RibbonOrganizerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: RibbonOrganizerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Quick commands")
      .setDesc("Commands shown in the Ribbon Organizer menu. A command not installed on this device is greyed out.")
      .setHeading();

    const registry = (this.app as unknown as { commands: { commands: Record<string, { icon?: string }> } }).commands.commands;
    const list = this.plugin.settings.quickCommands;
    const listEl = containerEl.createDiv({ cls: "ribbon-organizer-qc-list" });

    const persist = (): void => {
      void (async () => {
        await this.plugin.saveSettings();
        const scroll = containerEl.scrollTop;
        this.display();
        containerEl.scrollTop = scroll;
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
