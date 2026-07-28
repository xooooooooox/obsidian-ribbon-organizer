import { App, ButtonComponent, ExtraButtonComponent, Modal, setIcon } from "obsidian";
import { StatusBarRule, applyStatusBarRules, autoTemplateRule } from "../core/statusBarRules";
import { renderIcon } from "./iconRender";
import { IconSelectModal } from "./IconSelectModal";
import type RibbonOrganizerPlugin from "../main";

// Per-item customize modal: display-mode pills, the seen-state preview (each learned raw
// value shown alongside what the current rules make of it; click one to start a rule via
// auto-templating), and the rewrite-rule editor with an optional per-rule icon. Every
// change saves and re-applies immediately; the section behind refreshes via onDone when
// the modal closes.
export class StatusBarItemModal extends Modal {
  private seenEl: HTMLElement | null = null;

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
    this.seenEl = null;
    if (seen.length > 0) {
      contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Seen on this device — click one to start a rule" });
      this.seenEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-seen" });
      this.renderSeen(seen);
    }

    contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Rewrite rules" });
    this.rules().forEach((rule, index) => {
      const rowEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-rule" });
      const findEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Text to match" } });
      findEl.value = rule.find;
      rowEl.createSpan({ cls: "ribbon-organizer-sbm-arrow", text: "→" });

      const iconBtn = rowEl.createEl("button", { cls: "ribbon-organizer-sbm-iconbtn", attr: { "aria-label": "Pick an icon" } });
      if (rule.icon === undefined) {
        iconBtn.addClass("is-unset");
        setIcon(iconBtn, "plus");
      } else {
        renderIcon(iconBtn, rule.icon, undefined, this.app);
        const clearEl = iconBtn.createSpan({ cls: "ribbon-organizer-sbm-iconclear", attr: { "aria-label": "Remove icon" } });
        setIcon(clearEl, "x");
        clearEl.addEventListener("click", (event) => {
          event.stopPropagation();
          const next = this.rules();
          const prev = next[index];
          if (prev !== undefined) next[index] = { find: prev.find, replace: prev.replace };
          void this.saveRules(next).then(() => this.renderContent());
        });
      }
      iconBtn.addEventListener("click", () => {
        new IconSelectModal(this.app, (icon) => {
          const next = this.rules();
          const prev = next[index];
          if (prev !== undefined) next[index] = { ...prev, icon };
          void this.saveRules(next).then(() => this.renderContent());
        }).open();
      });

      const replaceEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Text (optional)" } });
      replaceEl.value = rule.replace;
      const commit = (): void => {
        const next = this.rules();
        const icon = next[index]?.icon;
        next[index] = icon === undefined ? { find: findEl.value, replace: replaceEl.value } : { find: findEl.value, replace: replaceEl.value, icon };
        void this.saveRules(next).then(() => this.renderSeen(this.plugin.settings.statusBarSeen[this.id] ?? []));
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
      text: "Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both. Anything that doesn't match a rule is shown as-is.",
    });
  }

  // The preview half of the seen section, re-rendered alone on rule edits so a mid-tab
  // focus never gets torn down with the whole modal body.
  private renderSeen(seen: string[]): void {
    if (this.seenEl === null) return;
    this.seenEl.empty();
    const rules = this.rules();
    for (const sample of [...seen].reverse()) {
      const rowEl = this.seenEl.createDiv({ cls: "ribbon-organizer-sbm-seenrow" });
      const chip = rowEl.createEl("button", { cls: "ribbon-organizer-sbm-chip", text: sample });
      chip.addEventListener("click", () => {
        void this.saveRules([...this.rules(), autoTemplateRule(sample, seen.filter((s) => s !== sample))]).then(() => this.renderContent());
      });
      rowEl.createSpan({ cls: "ribbon-organizer-sbm-arrow", text: "→" });
      const out = applyStatusBarRules(sample, rules);
      const resultEl = rowEl.createSpan({ cls: "ribbon-organizer-sbm-result" });
      if (out.text === sample && out.icon === null) {
        resultEl.addClass("is-asis");
        resultEl.setText(sample);
        continue;
      }
      if (out.icon !== null) renderIcon(resultEl.createSpan({ cls: "ribbon-organizer-sbm-result-icon" }), out.icon, undefined, this.app);
      if (out.text !== "") resultEl.createSpan({ text: out.text });
    }
  }

  private rules(): StatusBarRule[] {
    return (this.plugin.settings.statusBarRules[this.id] ?? []).map((rule) => ({ ...rule }));
  }

  private async saveRules(rules: StatusBarRule[]): Promise<void> {
    await this.plugin.setStatusBarItemRules(this.id, rules);
  }
}
