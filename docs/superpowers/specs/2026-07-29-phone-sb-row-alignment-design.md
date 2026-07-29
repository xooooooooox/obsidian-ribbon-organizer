# Phone Status-Bar Row Alignment Fix — Design

Mockup (定稿): https://claude.ai/code/artifact/749ab2c8-7415-4a89-8f6b-2be74cf91682

## Problem

On phones, the wand/mode/eye buttons in Status bar tab rows sit at inconsistent x positions:
rows with a "Not shown right now" / "Not on this device" note are right-aligned, rows without
one have the buttons hugging the title.

Root cause: in `.ribbon-organizer-sb-item` rows the right-pushing `margin-left: auto` lives on
the MIDDLE element — `.ribbon-organizer-sb-preview` (styles.css:124), `.ribbon-organizer-sb-missing`
(:126), `.ribbon-organizer-sb-pintag` (:140), `.ribbon-organizer-sb-notshown` (:158), or the
plugin chip via `.ribbon-organizer-sb-title + .ribbon-organizer-rg-plugin` (:131). The phone rules
(:134-135) hide BOTH the preview and the plugin chip, so any row whose spacer was one of those
two loses its spacer and the buttons collapse against the title. The groups tab fixed this same
class of bug already (:112); the status bar tab was missed.

## Fix (CSS-only, `is-phone` only)

```css
.is-phone .ribbon-organizer-sb-item .ribbon-organizer-rg-btns { margin-left: auto; }
.is-phone .ribbon-organizer-sb-notshown, .is-phone .ribbon-organizer-sb-pintag { margin-left: 0; }
```

- Buttons become the row's auto-margin carrier — a fixed right-aligned column on every row that
  has buttons.
- The "Not shown right now" / "Keeps its own position" notes stop competing for the spring (two
  auto margins would split the free space and float the note mid-row) and follow the title
  instead, like the `· N` ordinal.
- "Not on this device" rows have no buttons (`live === undefined` renders none), so
  `.ribbon-organizer-sb-missing` keeps its auto margin and stays right-aligned.
- Desktop: zero change.

Placement: immediately after the existing phone hide rules (styles.css:134-135), with a comment
mirroring the groups-tab precedent at :110-112.

## Testing

- Pure layer untouched — existing tests stay green; lint + build clean.
- Dev-vault smoke (desktop, simulated `is-phone`): computed `margin-left` of
  `.ribbon-organizer-sb-item .ribbon-organizer-rg-btns` resolves right-aligned (assert via
  bounding rect: buttons' right edge equals the row's content right edge on a note-less row),
  and `.ribbon-organizer-sb-notshown` computed `margin-left` is `0px`.
- Real-device verify (user): all rows' icons form one right column.

## Compatibility & docs

Patch semantics — ships as 0.14.1. ARCHITECTURE.md's settings-tab section gains one clause on
the phone auto-margin carrier hand-off.
