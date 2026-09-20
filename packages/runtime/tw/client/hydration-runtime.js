/**
 * TW Framework -- client runtime v2 (~5KB, no dependencies).
 *
 * Loaded on every TW page. Provides:
 *   1. Reactive state (seeded from <script id="__tw_state">)
 *   2. Event delegation for [data-tw-event-*] handlers (.prevent/.stop)
 *   3. Live interpolation spans [data-tw-i]
 *   4. Two-way input binding [data-tw-model]
 *   5. Conditional blocks [data-tw-if] / [data-tw-not]
 *   6. Live list rendering <tw-for data-tw-var data-tw-list data-tw-tpl>
 *   7. SPA client-side router (link interception, prefetch, popstate)
 */
(function () {
  "use strict";

  var stateEl = document.getElementById("__tw_state");
  var state = {};
  try { state = stateEl ? JSON.parse(stateEl.textContent) : {}; } catch (e) { state = {}; }

  // Strict symbol scope (spec): only the page's OWN imports are exposed
  // via __twClient.$page; layout imports carry dependency, not symbols.
  var twClientScope = function () {
    try { var c = globalThis.__twClient; return (c && c.$page) || {}; } catch (e) { return {}; }
  };

  function evalExpr(expr) {
    try {
      return (new Function("state", "tw", "with (tw) { with (state) { return (" + expr + "); } }"))(state, twClientScope());
    } catch (e) {
      return undefined;
    }
  }

  function runHandler(code) {
    try {
      (new Function("state", "event", "tw", "with (tw) { with (state) { " + code + "; } }"))(state, window.__twEvent || {}, twClientScope());
    } catch (e) {
      console.error("[tw] handler error:", code, e.message);
    }
  }

  function setSpanText(el, expr) {
    var val = evalExpr(expr);
    var txt = val === undefined || val === null ? "" : String(val);
    if (el.textContent !== txt) el.textContent = txt;
  }

  // --- Conditional blocks -----------------------------------------------------

  function refreshIfs(scope) {
    var ifs = (scope || document).querySelectorAll("[data-tw-if]");
    for (var i = 0; i < ifs.length; i++) {
      var el = ifs[i];
      var val = evalExpr(el.getAttribute("data-tw-if"));
      var show = !!val && val !== "false" && val !== "0" && val !== "";
      el.style.display = show ? "" : "none";
    }
    var nots = (scope || document).querySelectorAll("[data-tw-not]");
    for (var j = 0; j < nots.length; j++) {
      var el2 = nots[j];
      var val2 = evalExpr(el2.getAttribute("data-tw-not"));
      var hide = !!val2 && val2 !== "false" && val2 !== "0" && val2 !== "";
      el2.style.display = hide ? "none" : "";
    }
  }

  // --- Live lists (<tw-for>) ---------------------------------------------------

  function renderTemplateString(tpl, loopVar, itemRef) {
    // Evaluate all data-tw-i spans in the template HTML string, resolve
    // nested conditionals, and substitute the loop variable inside event
    // handlers so `todos.filter(x => x !== t)` works per item.
    var holder = document.createElement("tw-render");
    holder.innerHTML = tpl;
    var spans = holder.querySelectorAll("[data-tw-i]");
    for (var i = 0; i < spans.length; i++) setSpanText(spans[i], spans[i].getAttribute("data-tw-i"));

    // Nested if/not inside the loop body (evaluated while loopVar is bound)
    var all = holder.querySelectorAll("*");
    for (var a = 0; a < all.length; a++) {
      var el = all[a];
      var ifAttr = el.getAttribute && el.getAttribute("data-tw-if");
      if (ifAttr !== null && ifAttr !== undefined && el.hasAttribute("data-tw-if")) {
        var v1 = evalExpr(ifAttr);
        el.style.display = (v1 && v1 !== "false" && v1 !== "0" && v1 !== "") ? "" : "none";
      }
      var notAttr = el.getAttribute("data-tw-not");
      if (notAttr !== null && notAttr !== undefined && el.hasAttribute("data-tw-not")) {
        var v2 = evalExpr(notAttr);
        el.style.display = (v2 && v2 !== "false" && v2 !== "0" && v2 !== "") ? "none" : "";
      }
    }

    // Substitute the loop variable inside event handler expressions.
    // itemRef is a state key bound to the ACTUAL array item (identity is
    // preserved, so `todos.filter(x => x !== t)` works by reference).
    if (loopVar && itemRef) {
      var re = new RegExp("\\b" + loopVar + "\\b", "g");
      for (var e2 = 0; e2 < all.length; e2++) {
        var el2 = all[e2];
        if (!el2.attributes) continue;
        for (var ai = 0; ai < el2.attributes.length; ai++) {
          var attr = el2.attributes[ai];
          if (attr.name && attr.name.indexOf("data-tw-event-") === 0 && attr.name.indexOf("-prevent") === -1 && attr.name.indexOf("-stop") === -1) {
            var nv = attr.value.replace(re, itemRef);
            if (nv !== attr.value) el2.setAttribute(attr.name, nv);
          }
        }
      }
    }

    var out = holder.innerHTML;
    return out;
  }

  var twItemSeq = 0;

  function refreshLoops() {
    var loops = document.querySelectorAll("tw-for[data-tw-list]");
    for (var i = 0; i < loops.length; i++) {
      var el = loops[i];
      var arr = evalExpr(el.getAttribute("data-tw-list"));
      var v = el.getAttribute("data-tw-var");
      var tpl = el.getAttribute("data-tw-tpl") || "";
      if (!Array.isArray(arr)) arr = [];
      // clean refs from the previous render
      if (el.__twRefs) {
        for (var r = 0; r < el.__twRefs.length; r++) delete state[el.__twRefs[r]];
      }
      el.__twRefs = [];
      var html = "";
      for (var k = 0; k < arr.length; k++) {
        var ref = "__tw_item_" + (++twItemSeq);
        state[ref] = arr[k];
        el.__twRefs.push(ref);
        state[v] = arr[k];
        html += renderTemplateString(tpl, v, ref);
      }
      delete state[v];
      if (el.__twLen !== arr.length + ":" + html.length || el.__twHtml !== html) {
        el.innerHTML = html;
        el.__twLen = arr.length + ":" + html.length;
        el.__twHtml = html;
      }
    }
  }

  // --- Full refresh --------------------------------------------------------

  function refresh() {
    try { applyActiveClass(); } catch (e) { /* non-DOM context */ }
    try { scanPrefetch(); } catch (e) { /* non-DOM context */ }
    var spans = document.querySelectorAll("[data-tw-i]");
    for (var i = 0; i < spans.length; i++) setSpanText(spans[i], spans[i].getAttribute("data-tw-i"));
    var inputs = document.querySelectorAll("[data-tw-model]");
    for (var j = 0; j < inputs.length; j++) {
      var key = inputs[j].getAttribute("data-tw-model");
      if (key in state) {
        var v = state[key];
        if (String(inputs[j].value) !== String(v)) inputs[j].value = v;
      }
    }
    refreshLoops();
    refreshIfs();
  }

  // --- Event delegation ----------------------------------------------------

  var EVENTS = ["click", "dblclick", "input", "change", "submit", "keydown",
    "keyup", "keypress", "focus", "blur", "mouseenter", "mouseleave", "wheel"];

  EVENTS.forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var host = t.closest("[data-tw-event-" + ev + "]");
      if (!host) return;
      var code = host.getAttribute("data-tw-event-" + ev);
      if (!code) return;
      if (host.getAttribute("data-tw-event-" + ev + "-prevent") === "true") e.preventDefault();
      if (host.getAttribute("data-tw-event-" + ev + "-stop") === "true") e.stopPropagation();
      window.__twEvent = { target: t, value: t.value, type: ev };
      runHandler(code);
      refresh();
    }, true);
  });

  // Two-way: input with data-tw-model writes to state
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-tw-model")) {
      state[t.getAttribute("data-tw-model")] = t.value;
      refresh();
    }
  });

  // --- SPA client-side router ----------------------------------------------

  var prefetched = {};

  function sameOrigin(href) {
    return href.charAt(0) === "/" && href.charAt(1) !== "/";
  }

  function swapPage(html, path) {
    var newDoc = null;
    try {
      newDoc = new DOMParser().parseFromString(html, "text/html");
    } catch (e) { newDoc = null; }

    // Swap roots must stay symmetric: a page compiled with an interactive
    // root ([data-tw-root]) swaps that node only; a fully static page (no
    // interactive root) swaps the whole <body>, so layout chrome that only
    // exists on the incoming page is not lost.
    var liveRoot = document.querySelector("[data-tw-root]");
    var newRoot = newDoc ? (liveRoot ? (newDoc.querySelector("[data-tw-root]") || newDoc.body) : newDoc.body) : null;
    var oldRoot = liveRoot || document.body;
    if (!newRoot) { window.location.href = path; return; }

    // Merge new state into the live state object (keep identity)
    var seedEl = newDoc ? newDoc.getElementById("__tw_state") : null;
    if (seedEl) {
      try {
        var fresh = JSON.parse(seedEl.textContent);
        for (var k in state) delete state[k];
        for (var k2 in fresh) state[k2] = fresh[k2];
      } catch (e) { /* keep state */ }
    }
    // The new page may stream signals (or may not) -- re-evaluate the
    // connection and derived specs against the swapped-in DOM.
    loadDerivedSpecs();
    recomputeDerived();
    connectSignalStream();

    // Sync route stylesheets: SPA navigation must load any stylesheet the
    // incoming page links that the live document does not have yet
    // (route-split css assets). Links already present are kept as-is.
    try {
      var newLinks = newDoc ? newDoc.querySelectorAll('link[rel="stylesheet"]') : [];
      var have = {};
      var cur = document.querySelectorAll('link[rel="stylesheet"]');
      for (var ci = 0; ci < cur.length; ci++) have[cur[ci].getAttribute("href")] = true;
      for (var ni = 0; ni < newLinks.length; ni++) {
        var href = newLinks[ni].getAttribute("href");
        if (href && !have[href]) {
          var l = document.createElement("link");
          l.setAttribute("rel", "stylesheet");
          l.setAttribute("href", href);
          document.head.appendChild(l);
        }
      }
    } catch (e) { /* stylesheet sync is best-effort on SPA swap */ }

    // Keep the live <body> element (preserves document.body identity and
    // any listeners bound to it); swap its content instead of replacing it.
    if (oldRoot === document.body) {
      oldRoot.innerHTML = newRoot.innerHTML;
    } else {
      var imported = document.importNode ? document.importNode(newRoot, true) : newRoot.cloneNode(true);
      if (oldRoot.replaceWith) oldRoot.replaceWith(imported);
      else oldRoot.innerHTML = newRoot.innerHTML;
    }

    var t = newDoc ? newDoc.querySelector("title") : null;
    if (t) document.title = t.textContent;

    // re-run scripts inside the new root? (SSR pages usually have none)
    refresh();
  }

  function navigate(path, push) {
    fetch(path, { headers: { "X-TW-Navigate": "1" } })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        swapPage(html, path);
        if (push !== false) {
          try { history.pushState({ tw: 1 }, "", path); } catch (e) { /* ignore */ }
        }
        window.scrollTo(0, 0);
      })
      .catch(function () { window.location.href = path; });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || !sameOrigin(href) || href.startsWith("/api/")) return;
    if (a.hasAttribute("data-tw-native") || a.target === "_blank") return;
    e.preventDefault();
    navigate(href, true);
  });

  window.addEventListener("popstate", function () {
    navigate(window.location.pathname + window.location.search, false);
  });

  // Prefetch on hover (warms the HTTP cache)
  document.addEventListener("mouseover", function (e) {
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || !sameOrigin(href) || prefetched[href]) return;
    if (a.hasAttribute("data-tw-no-prefetch")) return;
    twPrefetch(href);
  }, true);

  // RouterLink prefetch strategies. The hover handler below covers the
  // default; these cover the explicit ones:
  //   data-tw-prefetch="always"   -> fetched immediately on load
  //   data-tw-prefetch="viewport" -> fetched when the link scrolls into view
  //   data-tw-no-prefetch          -> never fetched
  function twPrefetch(href) {
    if (!href || !sameOrigin(href) || prefetched[href]) return;
    prefetched[href] = true;
    try { fetch(href).catch(function () {}); } catch (e) { /* ignore */ }
  }

  function scanPrefetch() {
    var now = document.querySelectorAll('a[data-tw-prefetch="always"]');
    for (var i = 0; i < now.length; i++) twPrefetch(now[i].getAttribute("href"));

    var vp = document.querySelectorAll('a[data-tw-prefetch="viewport"]');
    for (var j = 0; j < vp.length; j++) {
      var a = vp[j];
      if (a.__twObserved) continue;
      a.__twObserved = true;
      if (typeof IntersectionObserver === "undefined") {
        twPrefetch(a.getAttribute("href"));
        continue;
      }
      try {
        var io = new IntersectionObserver(function (entries, obs) {
          for (var k = 0; k < entries.length; k++) {
            if (entries[k].isIntersecting) {
              var el = entries[k].target;
              el.__twViewportDone = true;
              twPrefetch(el.getAttribute("href"));
              obs.unobserve(el);
            }
          }
        }, { rootMargin: "200px" });
        io.observe(a);
      } catch (e) { twPrefetch(a.getAttribute("href")); }
    }
  }

  // RouterLink active-class: highlight the link whose route is current.
  // Exact match wins; "/blog" also matches "/blog/post-1" (prefix).
  function applyActiveClass() {
    var links = document.querySelectorAll("a[data-tw-active-class]");
    var path = window.location.pathname;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute("href") || "";
      var on = href === path || (href !== "/" && path.indexOf(href + "/") === 0);
      var cls = a.getAttribute("data-tw-active-class");
      if (on) a.classList.add(cls);
      else a.classList.remove(cls);
    }
  }

  // Signal Streaming (docs/183): pages with a __TW_SIGNALS__ manifest open
  // a persistent stream and patch their signal bindings in place. Reconnect
  // resumes from the last applied sequence number.
  var activeStream = null;

  // Derived signals (docs/183): named computed state, recomputed from the
  // other state vars on boot and after every stream frame.
  var derivedSpecs = null;
  function loadDerivedSpecs() {
    var el = document.getElementById("__TW_DERIVED__");
    derivedSpecs = null;
    if (!el) return;
    try {
      var spec = JSON.parse(el.textContent || "{}");
      derivedSpecs = spec.derived || null;
    } catch (e) { derivedSpecs = null; }
  }
  function recomputeDerived() {
    if (!derivedSpecs) return;
    for (var name in derivedSpecs) {
      try { state[name] = evalExpr(derivedSpecs[name]); } catch (e) { /* keep old */ }
    }
  }
  loadDerivedSpecs();
  recomputeDerived();

  function connectSignalStream() {
    if (activeStream) { activeStream.close(); activeStream = null; }
    var el = document.getElementById("__TW_SIGNALS__");
    if (!el) return;
    var manifest;
    try { manifest = JSON.parse(el.textContent || "{}"); } catch (e) { return; }
    var names = Object.keys(manifest.signals || {});
    if (!names.length) return;
    var lastSeq = 0;

    function apply(payload) {
      if (!payload || payload.v !== 1) return;
      if (payload.snapshot) {
        for (var k in payload.snapshot) {
          if (state[k] !== undefined || names.indexOf(k) >= 0) state[k] = payload.snapshot[k];
        }
      }
      var ups = payload.updates || [];
      for (var i = 0; i < ups.length; i++) {
        var name = ups[i][0], value = ups[i][1];
        if (names.indexOf(name) >= 0) state[name] = value;
      }
      if (payload.seq) lastSeq = payload.seq;
      recomputeDerived();
      refresh();
    }

    var es = null;
    function open() {
      es = new EventSource(
        "/_tw/stream?s=" + encodeURIComponent(names.join(",")) + "&since=" + lastSeq
      );
      es.onmessage = function (ev) {
        try { apply(JSON.parse(ev.data)); } catch (e) { /* malformed frame */ }
      };
      es.onerror = function () {
        // EventSource retries on its own, but with the original URL; close
        // and reopen so the connection resumes from lastSeq.
        try { es.close(); } catch (e) { /* already closed */ }
        setTimeout(open, 1500);
      };
    }
    open();
    activeStream = {
      close: function () {
        try { es.close(); } catch (e) { /* already closed */ }
        activeStream = null;
      },
    };
    window.__tw.signalStream = { reconnect: open, lastSeq: function () { return lastSeq; } };
  }

  // expose for debugging / userland
  window.__tw = {
    state: state,
    refresh: refresh,
    eval: evalExpr,
    navigate: navigate,
  };

  refresh();
  connectSignalStream();
})();
