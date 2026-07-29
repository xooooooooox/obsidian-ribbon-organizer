# Phone Status-Bar Row Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-align the wand/mode/eye button column on phone Status-bar rows.

**Architecture:** CSS-only — two rules in `styles.css`, placed after the existing phone hide rules; docs updated in the same task.

**Tech Stack:** Obsidian plugin CSS (`is-phone` platform class).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-phone-sb-row-alignment-design.md` — CSS verbatim-binding.
- NO-COMMIT mode: leave changes uncommitted; the controller commits at cut time.
- Gates: `npm test` (96 pass), `npm run lint` (0 errors, warnings ≤ baseline 67), `npm run build` clean.

### Task 1: Phone sb-row alignment CSS + docs

**Files:**
- Modify: `styles.css` (after line 135's phone hide rules)
- Modify: `docs/ARCHITECTURE.md` (settings-tab / status bar section)

- [ ] **Step 1: styles.css**

After `.is-phone .ribbon-organizer-sb-item .ribbon-organizer-rg-plugin, .is-phone .ribbon-organizer-sb-preview { display: none; }` add:

```css
/* Preview text / plugin chip / status notes carry the row's auto margin on desktop; with the
 * preview and chip display-none on phones the buttons take over right-alignment (mirrors the
 * groups-tab rule above) and the notes follow the title instead. Missing rows render no
 * buttons, so .ribbon-organizer-sb-missing keeps its own auto margin. */
.is-phone .ribbon-organizer-sb-item .ribbon-organizer-rg-btns { margin-left: auto; }
.is-phone .ribbon-organizer-sb-notshown, .is-phone .ribbon-organizer-sb-pintag { margin-left: 0; }
```

- [ ] **Step 2: docs/ARCHITECTURE.md** — in the status-bar settings section, one clause: on phones the preview/chip are hidden and the button group carries the auto margin (notes follow the title; missing rows keep the right-aligned note).

- [ ] **Step 3: Gates** — `npm test && npm run lint && npm run build`; expect 96 pass / 0 errors ≤ 67 warnings / clean build.

### Verification (controller-run)

Dev-vault smoke: build → copy into dev vault plugin dir → app:reload → add `is-phone` to body → open RO settings Status bar tab → assert a note-less row's `.ribbon-organizer-rg-btns` right edge ≈ row content right edge, and `.ribbon-organizer-sb-notshown` computed margin-left `0px`. Restore vault state.
