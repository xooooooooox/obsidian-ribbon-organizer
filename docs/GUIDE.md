# Ribbon and Status Bar Organizer — user guide

Ribbon and Status Bar Organizer works across three surfaces: the ribbon, its quick menus, and the status bar. For install and quick start steps, see [`../README.md`](../README.md).

## Ribbon groups

On the ribbon itself, a thin divider line renders between adjacent non-empty groups. Groups are managed from a single column mirroring the ribbon's final order: drag icons between groups, and drag groups to reorder them (on a touch screen, drag by the grip handle — the rest of the row scrolls the list). Groups start collapsed — the header shows a member count, or a visible/total pill when some members are hidden — and filtering reveals matches inside collapsed groups. Icons that aren't assigned to a group fall into the Ungrouped bucket, so newly installed plugins land in a predictable spot. Desktop and tablet ribbons are reordered in place; on phones, the plugin reorders the navbar ribbon menu (the ≡ button) as it opens, separators included.

Mark any Ungrouped icon to tuck it: it moves off the ribbon into one ⋯ button (icon customizable), and clicking the button reaches the tucked icons.

#### Conflicting ribbon plugins

Some plugins rearrange the ribbon themselves (Open Ribbon Groups, for example). Running one of them together with grouping makes the two fight over the ribbon, which can freeze Obsidian. Grouping therefore pauses itself while such a plugin is enabled — the ribbon stays as that plugin arranges it, and everything else (quick menus, the status bar tools, editing your groups in settings) keeps working. Disable the other plugin and grouping resumes on its own. Against ribbon-rearranging plugins it doesn't recognize by name, grouping watches the ribbon instead: if it starts churning, grouping turns itself off for the session and tells you.

## Hiding

The eye toggle on any row hides or shows that icon everywhere. Hiding writes Obsidian's native hide and Commander's hide list together (when Commander is installed); showing clears both. Commander matches icons by title, so two same-titled icons share the hide. Renaming a hidden icon makes it visible again and leaves a stale Commander entry behind. On phones, hidden icons also disappear from the navbar ribbon menu — including icons hidden only in Commander, which Obsidian's own menu would still show.

## Quick menus

Create any number of quick menus; each is one ribbon icon that opens its own command list, with an editable icon and name — click the name to rename it. Entries carry editable labels and icons, including Iconize packs and the built-in `ribbon-organizer` icon, and can be grouped with separators. Drag an entry by its grip to reorder it, on touch screens too — drop on a row's top or bottom half to land before or after it; dropping an entry on a menu header sends it to that menu's end (its own header included). Every row shows the owning plugin, with the exact command id in the hover tooltip; a command not installed on this device is greyed out in settings and left out of the ribbon popup, recovering automatically once its plugin is back. A menu whose commands are all missing on this device shows no ribbon icon; once one of its plugins is back, the icon returns at the next launch.

Renaming a menu changes its ribbon id, so it falls out of its ribbon group back into Ungrouped — re-drag it to restore.

## Status bar

The Status bar tab lists every status bar item. Changes apply live and on every device — items a device doesn't have keep their place. Items are recognized by their plugin, and a plugin showing several items keeps them apart by position, which in rare cases can swap after an update of that plugin.

#### Ordering and hiding

Drag a row to reorder it (on a touch screen, by the grip) — drop on a row's top or bottom half to land before or after it — and hide it with the eye toggle. Rows for items that exist but aren't visible right now (a Vim pending-key display, a hover-revealed button) say "Not shown right now". Self-positioning items show a lock and stay where their plugin puts them.

#### Display modes

Each row's mode button cycles Full → Compact (capped width, full text on hover) → Icon only.

#### Rewrite rules

The wand opens a per-item panel with display-mode pills and the rule editor. `Successfully synced {time}` → `✓ {time}` turns Remotely Save's long message into a glance; `{name}` carries the changing part over. Every rule can carry an icon and independent icon/text colors. Anything that doesn't match a rule is shown exactly as its plugin wrote it.

#### Learned samples

The tab learns the statuses seen on this device — each shown next to what the current rules make of it — and clicking one auto-drafts a rule. Learned samples stay on this device (localStorage); they never sync.

#### The preview strip

A preview strip mirrors the real bar. Hovering a row, the preview, or the bar itself highlights the same item in all three places.

#### Mobile

Obsidian hides the status bar on mobile by default. The "Show on phones and tablets" toggle floats it as a pill: on phones just above the bottom toolbar, on tablets (which have no bottom toolbar) hugging the bottom-right corner. On tablets the "Tablet style" dropdown offers a second look — instead of the floating pill, a bar docked flush in the corner like the desktop status bar.

## Diagnostics

**Copy ribbon diagnostics** copies a JSON snapshot — platform, both hide layers per icon, and the outcome of the last phone-menu grouping pass — to the clipboard. Attach it when reporting mobile issues.
