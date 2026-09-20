/** HTML5 elements, void tags, raw text tags, foreign elements, attributes. */

export const HTML_ELEMENTS = new Set([
  "html", "head", "title", "base", "link", "meta", "style", "body",
  "address", "article", "aside", "footer", "header", "h1", "h2", "h3",
  "h4", "h5", "h6", "main", "nav", "section",
  "blockquote", "dd", "div", "dl", "dt", "figcaption", "figure", "hr",
  "li", "menu", "ol", "p", "pre", "ul",
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn",
  "em", "i", "kbd", "mark", "q", "rp", "rt", "ruby", "s", "samp",
  "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
  "area", "audio", "img", "map", "track", "video",
  "embed", "iframe", "object", "param", "picture", "portal", "source",
  "canvas", "noscript", "script",
  "del", "ins",
  "caption", "col", "colgroup", "table", "tbody", "td", "tfoot", "th",
  "thead", "tr",
  "button", "datalist", "fieldset", "form", "input", "label", "legend",
  "meter", "optgroup", "option", "output", "progress", "select", "textarea",
  "details", "dialog", "summary",
  "slot", "template",
  "acronym", "applet", "basefont", "center", "dir", "font", "frame",
  "frameset", "noframes", "strike", "tt", "big",
  "svg", "path", "g", "rect", "circle", "ellipse", "line", "polyline",
  "polygon", "defs", "use", "symbol", "linearGradient", "radialGradient",
  "stop", "text", "tspan", "textPath", "clipPath", "mask", "pattern",
  "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode",
  "feColorMatrix", "feComposite", "feBlend", "feFlood", "feTile",
  "feTurbulence", "feDisplacementMap", "feConvolveMatrix", "feDistantLight",
  "fePointLight", "feSpotLight", "feSpecularLighting", "feDiffuseLighting",
  "animate", "animateMotion", "animateTransform", "set", "foreignObject",
  "image", "title",
  "math", "mi", "mo", "mn", "ms", "mtext", "mfrac", "msqrt", "mroot",
  "msub", "msup", "msubsup", "munder", "mover", "munderover", "mtable",
  "mtr", "mtd", "mrow", "mstyle", "merror", "mpadded", "mphantom",
  "mfenced", "menclose", "mspace", "mlabeledtr", "semantics",
  "annotation", "annotation-xml",
]);

export const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export const TEMPLATE_TAGS = new Set(["template", "slot"]);

export const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

export const FOREIGN_ELEMENTS = new Set(["svg", "math"]);

export const GLOBAL_ATTRIBUTES = new Set([
  "accesskey", "autocapitalize", "autofocus", "class", "contenteditable",
  "data", "dir", "draggable", "enterkeyhint", "exportparts", "hidden",
  "id", "inert", "inputmode", "is", "itemid", "itemprop", "itemref",
  "itemscope", "itemtype", "lang", "nonce", "part", "popover", "slot",
  "spellcheck", "style", "tabindex", "title", "translate",
  "virtualkeyboardpolicy", "writingsuggestions",
]);

export const EVENT_HANDLER_ATTRS = new Set([
  "onabort", "onafterprint", "onbeforeinput", "onbeforematch",
  "onbeforeprint", "onbeforetoggle", "onblur", "oncancel", "oncanplay",
  "oncanplaythrough", "onchange", "onclick", "onclose", "oncontextlost",
  "oncontextmenu", "oncontextrestored", "oncopy", "oncuechange", "oncut",
  "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave",
  "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied",
  "onended", "onerror", "onfocus", "onformdata", "oninput", "oninvalid",
  "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata",
  "onloadedmetadata", "onloadstart", "onmousedown", "onmouseenter",
  "onmouseleave", "onmousemove", "onmouseout", "onmouseover", "onmouseup",
  "onpaste", "onpause", "onplay", "onplaying", "onprogress", "onratechange",
  "onreset", "onresize", "onscroll", "onscrollend",
  "onsecuritypolicyviolation", "onseeked", "onseeking", "onselect",
  "onslotchange", "onstalled", "onsubmit", "onsuspend", "ontimeupdate",
  "ontoggle", "onvolumechange", "onwaiting", "onwheel",
  "onpointerdown", "onpointerup", "onpointermove", "onpointerenter",
  "onpointerleave", "onpointercancel", "onpointerover", "onpointerout",
  "ongotpointercapture", "onlostpointercapture", "onanimationstart",
  "onanimationend", "onanimationiteration", "ontransitionstart",
  "ontransitionend", "ontransitionrun", "ontransitioncancel",
  "onfullscreenchange", "onfullscreenerror", "onpointerlockchange",
  "onpointerlockerror", "onselectionchange", "onselectstart",
  "ontouchstart", "ontouchmove", "ontouchend", "ontouchcancel", "onmessage",
  "onmessageerror", "onstorage", "ononline", "onoffline", "onhashchange",
  "onpageshow", "onpagehide", "onpopstate", "onbeforeunload", "onunload",
]);

export const BOOLEAN_ATTRS = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls",
  "default", "defer", "disabled", "formnovalidate", "hidden", "ismap",
  "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open",
  "playsinline", "readonly", "required", "reversed", "selected",
  "shadowrootclonable", "shadowrootdelegatesfocus", "shadowrootserializable",
  "shadowrootmode",
]);

export const HTML_ATTRIBUTES = new Set([
  ...GLOBAL_ATTRIBUTES, ...EVENT_HANDLER_ATTRS,
  "accept", "accept-charset", "action", "allow", "alt", "as", "async",
  "autocomplete", "charset", "cite", "cols", "colspan", "content", "coords",
  "crossorigin", "datetime", "decoding", "default", "dir", "dirname",
  "download", "draggable", "enctype", "fetchpriority", "for", "form",
  "formaction", "formenctype", "formmethod", "formnovalidate", "formtarget",
  "headers", "height", "high", "href", "hreflang", "http-equiv", "id",
  "inputmode", "integrity", "is", "kind", "label", "list", "loading", "loop",
  "low", "max", "maxlength", "media", "method", "min", "minlength",
  "multiple", "muted", "name", "nonce", "optimum", "pattern", "placeholder",
  "playsinline", "poster", "preload", "referrerpolicy", "rel", "required",
  "reversed", "rows", "rowspan", "sandbox", "scope", "selected", "shape",
  "size", "sizes", "span", "src", "srcdoc", "srclang", "srcset", "start",
  "target", "type", "usemap", "value", "width", "wrap",
  "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "d",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "fill-opacity",
  "fill-rule", "clip-rule", "opacity", "transform", "viewBox",
  "preserveAspectRatio", "xmlns", "xlink:href", "gradientUnits",
  "gradientTransform", "spreadMethod", "offset", "stop-color",
  "stop-opacity", "text-anchor", "dominant-baseline", "font-family",
  "font-size", "font-weight", "font-style", "letter-spacing",
  "word-spacing", "text-decoration", "text-rendering", "points",
  "marker-start", "marker-mid", "marker-end", "clip-path", "mask", "filter",
  "pattern", "patternUnits", "patternTransform", "pathLength",
]);
