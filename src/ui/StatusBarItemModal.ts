import { App, ButtonComponent, ExtraButtonComponent, Modal } from "obsidian";
import { StatusBarRule } from "../core/statusBarRules";
import type RibbonOrganizerPlugin from "../main";

// Per-item customize modal: display-mode pills, learned "seen" chips (click to start a
// rule), and the rewrite-rule editor. Every change saves and re-applies immediately; the
// section behind refreshes via onDone when the modal closes.
export class StatusBarItemModal extends Modal {
  constructor(
    app: App,
    private plugin: RibbonOrganizerPlugin,
    private id: string,
    private itemName: string,
    private onDone: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("ribbon-organizer-sbm");
    this.renderContent();
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDone();
  }

  private renderContent(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(`${this.itemName} — how it shows`);

    contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Display" });
    const modesEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-modes" });
    const current = this.plugin.settings.statusBarModes[this.id] ?? "full";
    const MODES: { value: "full" | "compact" | "icon"; label: string }[] = [
      { value: "full", label: "Full" },
      { value: "compact", label: "Compact" },
      { value: "icon", label: "Icon only" },
    ];
    for (const mode of MODES) {
      const pill = modesEl.createEl("button", { cls: "ribbon-organizer-sbm-pill", text: mode.label });
      if (mode.value === current) pill.addClass("is-selected");
      pill.addEventListener("click", () => {
        void this.plugin.setStatusBarItemMode(this.id, mode.value).then(() => this.renderContent());
      });
    }

    const seen = this.plugin.settings.statusBarSeen[this.id] ?? [];
    if (seen.length > 0) {
      contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Seen on this device — click one to start a rule" });
      const seenEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-seen" });
      for (const sample of [...seen].reverse()) {
        const chip = seenEl.createEl("button", { cls: "ribbon-organizer-sbm-chip", text: sample });
        chip.addEventListener("click", () => {
          void this.saveRules([...this.rules(), { find: sample, replace: sample }]).then(() => this.renderContent());
        });
      }
    }

    contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Rewrite rules" });
    this.rules().forEach((rule, index) => {
      const rowEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-rule" });
      const findEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Text to match" } });
      findEl.value = rule.find;
      rowEl.createSpan({ cls: "ribbon-organizer-sbm-arrow", text: "→" });
      const replaceEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Show instead" } });
      replaceEl.value = rule.replace;
      const commit = (): void => {
        const next = this.rules();
        next[index] = { find: findEl.value, replace: replaceEl.value };
        void this.saveRules(next);
      };
      findEl.addEventListener("change", commit);
      replaceEl.addEventListener("change", commit);
      new ExtraButtonComponent(rowEl).setIcon("trash-2").setTooltip("Remove rule").onClick(() => {
        void this.saveRules(this.rules().filter((_, j) => j !== index)).then(() => this.renderContent());
      });
    });
    new ButtonComponent(contentEl.createDiv({ cls: "ribbon-organizer-sbm-addbar" })).setButtonText("Add rule").onClick(() => {
      void this.saveRules([...this.rules(), { find: "", replace: "" }]).then(() => this.renderContent());
    });

    contentEl.createDiv({
      cls: "ribbon-organizer-sbm-note",
      text: "Use {name} for the part that changes; it carries over to the result. Anything that doesn't match a rule is shown as-is.",
    });
  }

  private rules(): StatusBarRule[] {
    return (this.plugin.settings.statusBarRules[this.id] ?? []).map((rule) => ({ ...rule }));
  }

  private async saveRules(rules: StatusBarRule[]): Promise<void> {
    await this.plugin.setStatusBarItemRules(this.id, rules);
  }
}
