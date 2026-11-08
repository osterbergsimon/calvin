// The sandbox a kiosk puts on every frame it shows. Without allow-popups a framed
// page cannot open a window (target=_blank, window.open); without
// allow-top-navigation it cannot replace Calvin (target=_top, top.location). A
// kiosk has no tabs or back button, so either one strands the wall. Scripts,
// same-origin storage and forms stay so ordinary service dashboards keep working.
export const KIOSK_SANDBOX = "allow-scripts allow-same-origin allow-forms";
