/**
 * `tw dev` error overlay -- the development-only full-page error screen.
 *
 * In development an error must be loud and local: a server render/compile
 * failure serves a full page carrying the message, the file and the stack, and
 * a client-side error raises the same overlay in the browser. Production never
 * uses this -- `tw serve` / a deployed app returns its real error page.
 */

export interface DevErrorInfo {
  /** "Server Error" (SSR/compile) or "Unhandled Runtime Error" (client). */
  title?: string;
  message: string;
  stack?: string;
  /** App-relative path of the file the error came from, when known. */
  file?: string;
  line?: number;
  col?: number;
}

const OVERLAY_CSS = [
  "*{box-sizing:border-box}",
  "body.tw-err{margin:0;background:#1a1a1a;color:#e8e8e8;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
  ".tw-err-wrap{padding:40px 32px 64px}",
  ".tw-err-badge{display:inline-block;background:#ff3b30;color:#fff;font:700 11px/1 ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:4px}",
  ".tw-err-title{font:600 24px/1.3 ui-sans-serif,system-ui;margin:18px 0 4px}",
  ".tw-err-file{color:#8b949e;margin-bottom:20px}",
  ".tw-err-file b{color:#79c0ff;font-weight:600}",
  ".tw-err-msg{background:#2a1416;border:1px solid #5c1d21;border-left:3px solid #ff3b30;border-radius:6px;padding:16px 18px;color:#ffb3ae;white-space:pre-wrap;word-break:break-word}",
  ".tw-err-stack{margin-top:20px;background:#111;border:1px solid #30363d;border-radius:6px;padding:16px 18px;overflow:auto;max-height:46vh}",
  ".tw-err-stack pre{margin:0;color:#c9d1d9;white-space:pre-wrap;word-break:break-word}",
  ".tw-err-hint{margin-top:22px;color:#8b949e}",
  ".tw-err-hint code{background:#21262d;border-radius:3px;padding:2px 6px;color:#e8e8e8}",
].join("");

const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A full HTML document for a development server-side error. */
export function devErrorPage(info: DevErrorInfo): string {
  const where = info.file
    ? '<div class="tw-err-file">in <b>' + esc(info.file) + "</b>" + (info.line ? ":" + info.line + (info.col ? ":" + info.col : "") : "") + "</div>"
    : "";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(info.title ?? "Server Error") + "</title>"
    + "<style>" + OVERLAY_CSS + '</style></head><body class="tw-err"><div class="tw-err-wrap">'
    + '<span class="tw-err-badge">' + esc(info.title ?? "Server Error") + "</span>"
    + '<h1 class="tw-err-title">This page failed to render</h1>' + where
    + '<div class="tw-err-msg">' + esc(info.message) + "</div>"
    + (info.stack ? '<div class="tw-err-stack"><pre>' + esc(info.stack) + "</pre></div>" : "")
    + '<p class="tw-err-hint">Fix the error and save -- <code>tw dev</code> reloads the page automatically.</p>'
    + "</div></body></html>";
}

/**
 * Injected into every page `tw dev` serves. Catches client-side errors and
 * unhandled rejections and raises the same overlay, so a runtime error in the
 * browser is as visible as a server one.
 */
export const CLIENT_OVERLAY_SCRIPT = "<script id=\"__tw_error_overlay\">(function(){"
  + "if(window.__twOverlay)return;window.__twOverlay=1;"
  + "var CSS=" + JSON.stringify(OVERLAY_CSS) + ";"
  + "function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;')}"
  + "function show(title,msg,stack){try{"
  + "var old=document.getElementById('__tw_error_overlay_ui');if(old)old.remove();"
  + "var d=document.createElement('div');d.id='__tw_error_overlay_ui';"
  + "d.setAttribute('style','position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#1a1a1a');"
  + "var st=document.createElement('style');st.textContent=CSS;d.appendChild(st);"
  + "var w=document.createElement('div');w.className='tw-err-wrap';"
  + "w.innerHTML='<span class=\"tw-err-badge\">'+esc(title)+'</span>'"
  + "+'<h1 class=\"tw-err-title\">Unhandled error in the browser</h1>'"
  + "+'<div class=\"tw-err-msg\">'+esc(msg)+'</div>'"
  + "+(stack?'<div class=\"tw-err-stack\"><pre>'+esc(stack)+'</pre></div>':'')"
  + "+'<p class=\"tw-err-hint\">Fix it and save -- <code>tw dev</code> reloads automatically.</p>';"
  + "d.appendChild(w);document.body.appendChild(d);}catch(e){}}"
  + "window.addEventListener('error',function(ev){"
  + "if(ev&&ev.target&&ev.target!==window&&ev.target.tagName){return}"
  + "show('Unhandled Runtime Error',(ev&&ev.message)||'Script error',ev&&ev.error&&ev.error.stack);});"
  + "window.addEventListener('unhandledrejection',function(ev){"
  + "var r=ev&&ev.reason;show('Unhandled Rejection',(r&&r.message)||String(r),r&&r.stack);});"
  + "})();</script>";
