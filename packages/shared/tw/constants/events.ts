/** Event types and render/revalidate modes. */

export const EVENT_TYPES = new Set([
  "click", "dblclick", "mousedown", "mouseup", "mousemove", "mouseover",
  "mouseout", "mouseenter", "mouseleave", "contextmenu", "wheel",
  "keydown", "keyup", "keypress",
  "input", "change", "submit", "reset", "focus", "blur", "focusin",
  "focusout", "invalid", "select", "search", "beforeinput", "formdata",
  "touchstart", "touchmove", "touchend", "touchcancel",
  "pointerdown", "pointerup", "pointermove", "pointercancel", "pointerover",
  "pointerout", "pointerenter", "pointerleave", "gotpointercapture",
  "lostpointercapture", "animationstart", "animationend",
  "animationiteration", "animationcancel", "transitionstart",
  "transitionend", "transitionrun", "transitioncancel",
  "play", "pause", "playing", "waiting", "durationchange", "timeupdate",
  "ratechange", "volumechange", "seeking", "seeked", "stalled", "suspend",
  "emptied", "loadeddata", "loadedmetadata", "canplay", "canplaythrough",
  "ended", "progress", "loadstart", "error", "abort",
  "copy", "cut", "paste", "drag", "dragstart", "dragend", "dragenter",
  "dragleave", "dragover", "drop", "load", "unload", "beforeunload",
  "resize", "scroll", "scrollend", "hashchange", "popstate", "pageshow",
  "pagehide", "online", "offline", "storage", "message", "messageerror",
  "fullscreenchange", "fullscreenerror", "pointerlockchange",
  "pointerlockerror", "selectionchange", "selectstart", "visibilitychange",
  "toggle", "beforematch", "beforetoggle", "cancel", "close", "cuechange",
  "slotchange", "contentvisibilityautostatechange", "open", "close",
  "unhandledrejection", "rejectionhandled", "securitypolicyviolation",
  "overscroll",
]);

export const RENDER_MODES = new Set([
  // Documented modes (docs/syntax-page-config.md, docs/render-modes.md): static, ssr, island, edge, csr,
  // stream, ppr. `ssr` is accepted separately in the parser; the extra
  // aliases below are kept for programmatic SDK use.
  "static", "server", "edge", "interactive", "client", "island",
  "csr", "stream", "ppr", "signalStream",
]);

export const REVALIDATE_MODES = new Set([
  "static", "on-demand", "tag", "path", "time", "ISR", "ssr",
]);
