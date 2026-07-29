# Product Polish Audit — Design

Date: 2026-07-29. Scope: this repo (Ribbon Organizer). A sibling audit with the same rubric runs in config-sync.

## Goal

One polish iteration with four deliverables:

1. **Rename (decided, not subject to adjudication):** display name becomes **"Ribbon & Status Bar Organizer"**. `manifest.json` `name` and `description` change; `id: ribbon-organizer` and the repo name stay (the plugin is already listed in the community store registry — changing the id would orphan the listing). README / README.zh titles and branding follow. After the release, verify whether the registry mirror propagates the new name/description to the store entry; if not, open a PR against `obsidianmd/obsidian-releases`.
2. **Lightweight DESIGN.md** at `docs/DESIGN.md`: the visual and copy language the plugin already uses, extracted from `styles.css` and the settings UI — icon selection rules (lucide, semantic), spacing/sizing conventions, mobile adaptation patterns (row stacking, right-aligned buttons, floating pill), copy voice. Shorter than config-sync's DESIGN.md but same intent: the ruler future UI changes are measured against.
3. **Three audits**, producing a findings report (no code changes until the owner adjudicates):
   - **Copy audit** — every user-visible string (settings panels, notices, modals, buttons, tooltips, command names, manifest description) against the product-voice rule.
   - **Design-compliance audit** — styles and icons in `styles.css` + `src/ui/*` against the DESIGN.md draft; inconsistencies between sections count even where DESIGN is silent.
   - **Docs-currency audit** — README.md, README.zh.md, docs/ARCHITECTURE.md, CLAUDE.md checked section-by-section against current behavior (0.14.2). Known gaps going in: the rename itself; 0.11–0.14 features (rewrite rules with icons and colors, mode pills, seen storage, mobile UX pass) may be under-documented.
4. **Adjudicated fix batch + cut** as **0.15.0** (rename + copy changes are minor-worthy).

## Product-voice rule (rubric for the copy audit)

- UI copy speaks the user's language, not the implementation's: no internal identifiers (`data.json`, `qualifier`, observer, CSS class names, setting keys) unless the surface is explicitly a developer tool (the diagnostics command may name JSON).
- Narrate by device and consequence ("stays hidden on this phone"), not by mechanism ("writes both hide layers").
- Controls say what happens; notices confirm what happened; errors say what failed and what to do.
- Sentence case per Obsidian guidelines; brand names (`Ribbon & Status Bar Organizer`, `Obsidian`, `Commander`, `Iconize`, `Ungrouped`) keep their casing.

## Process

Findings report format per item: location (`file:line`) · current text/style · principle violated · proposed fix (for copy: the exact replacement string, which is the candidate final copy). Layout-affecting proposals additionally get a mockup before implementation; pure copy and doc corrections do not.

Owner adjudicates the report (and the DESIGN.md draft) item-by-item or in batches; accepted items are applied in one fix batch; then the cut.

## Out of scope

README screenshots (queued separately with the store-listing follow-up); any behavior change; touch drag-and-drop and other carried minors.
