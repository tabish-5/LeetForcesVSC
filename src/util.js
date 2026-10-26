const fs = require('fs');
const path = require('path');

class AuthError extends Error {
  constructor(message, missing = false) { super(message); this.missing = missing; }
}

const str = (v) => (v == null ? '' : String(v));
const num = (v) => (typeof v === 'number' ? v : 0);
const squash = (s) => str(s).replace(/\s+/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (t, n) => { t = str(t).replace(/\n/g, ' | '); return t.length <= n ? t : t.slice(0, Math.max(0, n - 3)) + '...'; };
const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function readJson(p, def = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

const NAMED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', le: '≤', ge: '≥', ne: '≠', times: '×', minus: '−', rarr: '→', larr: '←', hellip: '…', ndash: '–', mdash: '—' };
function decodeEntities(text) {
  return str(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, n) => {
    if (n[0] === '#') {
      try {
        const cp = /^#[xX]/.test(n) ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
        return String.fromCodePoint(cp);
      } catch { return m; }
    }
    return NAMED[n] !== undefined ? NAMED[n] : m;
  });
}

/** Codeforces $$$LaTeX$$$ -> readable HTML. */
function latexToHtml(x) {
  let h = x
    .replace(/\\(le|leq)(?![a-zA-Z])/g, '≤').replace(/\\(ge|geq)(?![a-zA-Z])/g, '≥')
    .replace(/\\ne(?![a-zA-Z])/g, '≠').replace(/\\cdot(?![a-zA-Z])/g, '·')
    .replace(/\\times(?![a-zA-Z])/g, '×').replace(/\\(ldots|dots|cdots)(?![a-zA-Z])/g, '…')
    .replace(/\\oplus(?![a-zA-Z])/g, '⊕').replace(/\\(lfloor)(?![a-zA-Z])/g, '⌊').replace(/\\(rfloor)(?![a-zA-Z])/g, '⌋')
    .replace(/\\(lceil)(?![a-zA-Z])/g, '⌈').replace(/\\(rceil)(?![a-zA-Z])/g, '⌉')
    .replace(/\\(rightarrow|to)(?![a-zA-Z])/g, '→').replace(/\\(infty)(?![a-zA-Z])/g, '∞')
    .replace(/\\(max|min|gcd|lcm|sum|log|bmod|mod)(?![a-zA-Z])/g, '$1')
    .replace(/\\(?:mathrm|text|operatorname|mathit|textbf|mathbf)\{([^{}]*)\}/g, '$1')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\[,;! ]/g, ' ').replace(/\\\{/g, '{').replace(/\\\}/g, '}');
  h = h.replace(/_(\{([^{}]+)\}|[A-Za-z0-9])/g, (m, a, b) => `<sub>${b !== undefined ? b : a}</sub>`);
  h = h.replace(/\^(\{([^{}]+)\}|[A-Za-z0-9])/g, (m, a, b) => `<sup>${b !== undefined ? b : a}</sup>`);
  return h;
}

/** Removes one whole <div class="cls"> block, nested divs included. */
function stripDiv(html, cls) {
  const m = new RegExp(`<div[^>]*class="${cls}"[^>]*>`).exec(html);
  if (!m) return html;
  const start = m.index;
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = start;
  let depth = 0, t;
  while ((t = re.exec(html))) {
    if (t[0].toLowerCase() === '</div>') {
      if (--depth === 0) return html.slice(0, start) + html.slice(re.lastIndex);
    } else depth++;
  }
  return html;
}

/** Only plain identifiers may become part of a file path or URL. */
function safeName(v) {
  const s = str(v);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Refusing unsafe problem identifier: ' + JSON.stringify(s.slice(0, 40)));
  return s;
}

/** fetch with a timeout; redirects are followed only within the original origin (cookies never leave it). */
async function safeFetch(url, init = {}, timeoutMs = 30000, follow = true) {
  let cur = url;
  const origin = new URL(url).origin;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(cur, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = r.headers.get('location');
    if (follow && r.status >= 300 && r.status < 400 && loc) {
      const next = new URL(loc, cur);
      if (next.origin !== origin) throw new Error('Blocked redirect to another site: ' + next.origin);
      cur = next.href;
      if ([301, 302, 303].includes(r.status) && init.method === 'POST') init = { ...init, method: 'GET', body: undefined };
      continue;
    }
    return r;
  }
  throw new Error('Too many redirects.');
}

function netError(site, e) {
  if (e && e.name === 'TimeoutError') return new Error(`The request to ${site} timed out.`);
  if (e && /^Blocked redirect|^Too many redirects/.test(e.message)) return e;
  return new Error(`Could not connect to ${site}. Check your internet.\n${e && e.message}`);
}

module.exports = { safeName, safeFetch, netError, AuthError, str, num, squash, sleep, clip, esc, readJson, writeJson, decodeEntities, latexToHtml, stripDiv };
