// A user-added command surfaced in the Ribbon Organizer menu (see core/quickCommands.ts).
export interface QuickCommand {
  commandId: string; // e.g. "remotely-save:start-sync"; run via app.commands.executeCommandById
  label: string;     // menu title; defaults to the command's name at add-time, editable
  icon: string;      // lucide id; defaults to the command's own icon; editable via the icon picker
}

// A divider inserted between quick commands in the menu.
export interface QuickSeparator {
  kind: "separator";
}

export type QuickEntry = QuickCommand | QuickSeparator;

export function isSeparator(e: QuickEntry): e is QuickSeparator {
  return (e as QuickSeparator).kind === "separator";
}

// A user-defined ribbon menu: one composite ribbon icon opening its own command list
// (see core/quickMenus.ts). The ribbon item id derives from `name` ("ribbon-organizer:<name>"),
// so `id` is the stable settings identity that survives renames.
export interface QuickMenu {
  id: string;            // uuid, assigned at creation
  name: string;          // ribbon tooltip; unique among menus
  icon: string;          // lucide id; editable via the icon picker
  entries: QuickEntry[]; // commands + separators
}
