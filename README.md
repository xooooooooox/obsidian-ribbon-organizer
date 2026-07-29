<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon and Status Bar Organizer logo"></p>

# Ribbon and Status Bar Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)
[![downloads](https://img.shields.io/github/downloads/xooooooooox/obsidian-ribbon-organizer/total?label=downloads)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases)
[![Static Badge](https://img.shields.io/badge/README-EN-blue)](./README.md)
[![Static Badge](https://img.shields.io/badge/README-中-red)](./README.zh.md)

An [Obsidian](https://obsidian.md) plugin that organizes the left ribbon and launches your commands from configurable ribbon menus.

## Features

- **Ribbon groups** — order the ribbon icons into named groups with a thin divider line between them; works on desktop, on the tablet drawer ribbon, and in the phone navbar ribbon menu (the ≡ button).
- **Tuck Ungrouped icons into a menu** — mark any Ungrouped icon and it moves off the ribbon into one ⋯ button (icon customizable); click the button to reach them.
- **Hide icons** — an eye toggle per icon that writes both Obsidian's native hide and [Commander](https://github.com/jsmorabito/obsidian-commander)'s hide list, so the three UIs never disagree.
- **Quick menus** — any number of extra ribbon icons, each opening its own command list; entries carry editable labels and icons (including [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) packs and the plugin's built-in `ribbon-organizer` icon) and can be grouped with separators.
- **Status bar** — drag the status bar items into your own order, hide the ones you don't need, shorten noisy ones (compact and icon-only modes, plus rewrite rules like `Successfully synced {time}` → `✓ {time}` — a rule can also add an icon and give the icon and text their own colors), watch it all in a live preview, and optionally show the status bar on phones and tablets as a floating pill.
- **Diagnostics** — a "Copy ribbon diagnostics" command copies a JSON snapshot to the clipboard for issue reports.
- Configuration lives in the plugin's `data.json`, so it follows whatever vault sync you use; the status texts the plugin learns stay on each device by design.

## Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `xooooooooox/obsidian-ribbon-organizer`.

## Quick start

1. Open **Settings → Ribbon and Status Bar Organizer → Ribbon**: create a group and drag icons into it — dividers appear on the ribbon between adjacent non-empty groups.
2. Use the eye toggle on any row to hide or show that icon everywhere.
3. Switch to the **Quick menus** tab: create a menu and add commands — the menu appears as its own ribbon icon.

## How it works

### Ribbon groups

Groups are managed from a single column mirroring the ribbon's final order: drag icons between groups, drag groups to reorder. Groups start collapsed — the header shows a member count, or a visible/total pill when some members are hidden — and filtering reveals matches inside collapsed groups. Icons you haven't assigned fall into the ungrouped bucket, so newly installed plugins land in a predictable spot. Desktop and tablet ribbons are reordered in place; on phones the plugin reorders the navbar ribbon menu (the ≡ button) as it opens, separators included.

### Hiding

Hiding writes Obsidian's native hide and Commander's hide list together (when Commander is installed), and showing clears both. Caveats: Commander matches icons by title, so two same-titled icons share the hide, and renaming a hidden icon makes it visible again while leaving a stale Commander entry behind. On phones, hidden icons also disappear from the navbar ribbon menu — including icons hidden only in Commander, which Obsidian's own menu would still show.

### Status bar

The Status bar tab lists every status bar item; drag to reorder (drop on a row's top or bottom half to land before or after it), hide with the eye, and everything applies live and on every device — items a device doesn't have keep their place. Each row's mode button cycles Full → Compact (capped width with the full text on hover) → Icon only, and the wand opens a per-item panel: display-mode pills, the statuses seen on this device — each shown next to what your current rules make of it, click one to auto-draft a rule — and the rule editor, where every rule can carry an icon and independent icon/text colors. `Successfully synced {time}` → `✓ {time}` turns Remotely Save's long message into a glance, `{name}` carries the changing part over, and anything that doesn't match a rule is shown exactly as its plugin wrote it. The tab learns the statuses it has seen so you can start a rule from a real example (learned samples stay on this device — they never sync). Rows for items that exist but aren't visible right now (a Vim pending-key display, a hover-revealed button) say "Not shown right now"; self-positioning items show a lock and stay where their plugin puts them; a preview strip mirrors the real bar and hovering a row, the preview, or the bar itself highlights the same item in all three places. Obsidian hides the status bar on mobile by default: the "Show on phones and tablets" toggle floats it above the toolbar. Items are recognized by their plugin; a plugin showing several items keeps them apart by position, which in rare cases can swap after an update of that plugin.

### Quick menus

Each menu is one ribbon icon (icon and name editable — click the name to rename it) opening its own command list. Drag entries to reorder them (drop on a row's top or bottom half to land before or after it); dropping one on a menu header sends it to that menu's end (its own header included). Every row shows the plugin the command belongs to, with the exact command id in the hover tooltip; a command not installed on the current device is greyed out and recovers automatically once its plugin is installed. Caveat: renaming a menu changes its ribbon id, so it falls out of its ribbon group back into Ungrouped — re-drag it to restore.

### Diagnostics

**Copy ribbon diagnostics** copies a JSON snapshot — platform, both hide layers per icon, and the outcome of the last phone-menu grouping pass — to the clipboard. Attach it when reporting mobile issues.

## Development

- `npm run build` — typecheck + production bundle · `npm test` — unit tests · `npm run lint` — zero-warning baseline
- Code map, invariants, and extension points: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## License

MIT
