import { App, Command, FuzzyMatch, FuzzySuggestModal } from "obsidian";
import { renderIcon } from "./iconRender";

// Fuzzy-search over every registered command, each suggestion rendered with its command's
// icon preview (mirrors IconSelectModal); used by the Quick menus settings section to
// add an entry.
export class CommandSelectModal extends FuzzySuggestModal<Command> {
  constructor(app: App, private onChoose: (cmd: Command) => void) {
    super(app);
    this.setPlaceholder("Pick a command to add");
  }
  getItems(): Command[] {
    const registry = (this.app as unknown as { commands: { commands: Record<string, Command> } }).commands;
    return Object.values(registry.commands);
  }
  getItemText(cmd: Command): string {
    return cmd.name;
  }
  renderSuggestion(match: FuzzyMatch<Command>, el: HTMLElement): void {
    el.addClass("ribbon-organizer-iconpick");
    renderIcon(el.createSpan({ cls: "ribbon-organizer-iconpick-glyph" }), match.item.icon ?? "command", undefined, this.app);
    el.createSpan({ text: match.item.name });
  }
  onChooseItem(cmd: Command): void {
    this.onChoose(cmd);
  }
}
