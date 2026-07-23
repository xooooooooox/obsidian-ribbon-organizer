// Commander (plugin id "cmdr") hides ribbon icons per TITLE via a stylesheet it injects as
// <style id="cmdr">. Its CSS builder is module-private, so when Ribbon Organizer edits
// Commander's hide list it must rebuild that stylesheet itself — same-session unhide would
// otherwise stay hidden behind the stale rule. The rule format below is byte-for-byte
// Commander's own (leftRibbon rules first, then statusbar, no separators).

export interface CmdrHideLists {
  leftRibbon: string[]; // ribbon icon titles (aria-labels)
  statusbar: string[]; // plugin ids; preserved verbatim, never edited by Ribbon Organizer
}

export function cmdrHideStyleText(hide: CmdrHideLists): string {
  let text = "";
  for (const title of hide.leftRibbon) {
    text += `div.side-dock-ribbon-action[aria-label="${title}"] {display: none !important; content-visibility: hidden;}`;
  }
  for (const id of hide.statusbar) {
    text += `div.status-bar-item.plugin-${id} {display: none !important; content-visibility: hidden;}`;
  }
  return text;
}

// New list with the title present exactly once, or absent entirely.
export function withTitle(list: string[], title: string, present: boolean): string[] {
  const without = list.filter((t) => t !== title);
  return present ? [...without, title] : without;
}
