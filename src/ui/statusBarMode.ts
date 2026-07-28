// Shared metadata for the three status-bar display modes — the settings row's cycle
// button and the customize modal's pills must stay visually identical.
export type StatusBarMode = "full" | "compact" | "icon";

export const MODE_NEXT: Record<StatusBarMode, StatusBarMode> = { full: "compact", compact: "icon", icon: "full" };
export const MODE_ICON: Record<StatusBarMode, string> = { full: "text", compact: "ellipsis", icon: "circle-dot" };
export const MODE_NAME: Record<StatusBarMode, string> = { full: "Full", compact: "Compact", icon: "Icon only" };
