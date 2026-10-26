const { esc, str, latexToHtml, stripDiv } = require('./util');

const CF_BASE = 'https://codeforces.com';
// Remote statements may only load images from the judges' own hosts (no tracking pixels elsewhere).
const IMG_HOSTS = 'https://codeforces.com https://*.codeforces.com https://leetcode.com https://*.leetcode.com https://aliyun-lc-upload.oss-cn-hangzhou.aliyuncs.com data:';

/** Defence in depth: the CSP already blocks scripts; this also drops active tags, handlers and script-ish URLs. */
function sanitize(h) {
  return h
    .replace(/<(script|style|iframe|object|embed|form|svg|math|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form|link|meta|base|input|button|textarea|select|svg|math|template)\b[^>]*>/gi, '')
    .replace(/\s(on[a-z]+|style|srcset|formaction|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("\s*(javascript|vbscript|data):[^"]*"|'\s*(javascript|vbscript|data):[^']*')/gi, (m, k) => (k.toLowerCase() === 'src' && /data:image\//i.test(m) ? m : ''));
}
const cap = (v, n = 20000) => { const s = str(v); return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more characters not shown)` : s; };

const CSS = `
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);padding:14px 22px;line-height:1.55}
a{color:var(--vscode-textLink-foreground)}
code,pre,.mono{font-family:var(--vscode-editor-font-family);font-size:.95em}
pre{background:var(--vscode-textCodeBlock-background);padding:8px 12px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
code{background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px}
pre code{background:none;padding:0}
img{max-width:100%}
h1{font-size:1.45em;margin:.1em 0 .4em}
.muted{opacity:.7}
.ok{color:var(--vscode-testing-iconPassed,#3fb950)}
.bad{color:var(--vscode-testing-iconFailed,#f85149)}
.warn{color:var(--vscode-editorWarning-foreground,#d29922)}
.pill{display:inline-block;padding:0 9px;border-radius:10px;font-size:.85em;margin:0 6px 4px 0;border:1px solid var(--vscode-panel-border,#555)}
.card{border:1px solid var(--vscode-panel-border,#555);border-radius:6px;padding:10px 16px;margin-bottom:18px}
`;

function shell(title, body, extraCss = '', script = '', nonce = '') {
  const csp = `default-src 'none'; img-src ${IMG_HOSTS}; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none';` + (nonce ? ` script-src 'nonce-${nonce}';` : '');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}${extraCss}</style></head><body>${body}${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
}

const diffClass = (d) => (d === 'Easy' ? 'ok' : d === 'Medium' ? 'warn' : 'bad');
const ratingClass = (r) => { const n = parseInt(r, 10); return !n || n < 1200 ? 'ok' : n < 1900 ? 'warn' : 'bad'; };

function solvedBadge(plat, p, cfState) {
  if (plat === 'lc') {
    if (p.status === 'ac') return '<span class="ok">✔ Submitted (Accepted)</span>';
    if (p.status === 'notac') return '<span class="warn">◐ Submitted, not accepted yet</span>';
    return '';
  }
  if (cfState === 'solved') return '<span class="ok">✔ Submitted (Accepted)</span>';
  if (cfState === 'same') return '<span class="ok">✔ Submitted in another round (Accepted)</span>';
  if (cfState === 'tried') return '<span class="warn">◐ Submitted, not accepted yet</span>';
  return '';
}

// ---------------- description ----------------

const DESC_CSS = `
.problem-statement .header{display:none}
.problem-statement .section-title,.problem-statement .property-title{font-weight:600}
.problem-statement .section-title{font-size:1.1em;margin:1.2em 0 .3em}
.sample-tests .title,.input-output-copier{font-weight:600;opacity:.8;margin:.4em 0 .2em}
.input-output-copier{display:none}
.test-example-line{display:block}
.math{font-family:var(--vscode-editor-font-family);font-style:italic}
.tex-font-style-bf{font-weight:bold}.tex-font-style-it{font-style:italic}
.tex-span{font-style:italic}
li{margin:.2em 0}
table{border-collapse:collapse}td,th{border:1px solid var(--vscode-panel-border,#555);padding:2px 8px}
`;

function prepContent(plat, content) {
  let h = sanitize(str(content));
  if (plat === 'cf') {
    h = stripDiv(h, 'header');
    h = h.replace(/(src|href)="\/(?!\/)/g, `$1="${CF_BASE}/`);
    h = h.replace(/\$\$\$([\s\S]*?)\$\$\$/g, (m, x) => `<span class="math">${latexToHtml(x)}</span>`);
  }
  return h;
}

function descriptionHtml(plat, p, { cfState, link }) {
  const title = plat === 'lc' ? `#${p.number} ${p.title}` : `${p.code} · ${p.title}`;
  const pills = [];
  if (plat === 'lc') pills.push(`<span class="pill ${diffClass(p.difficulty)}">● ${esc(p.difficulty || '-')}</span>`);
  else {
    pills.push(`<span class="pill ${ratingClass(p.rating)}">● ${esc(p.rating || 'unrated')}</span>`);
    pills.push(`<span class="pill">${esc(p.time_limit)} s</span><span class="pill">${esc(p.memory)} MB</span>`);
    for (const t of p.tags || []) pills.push(`<span class="pill muted">${esc(t)}</span>`);
  }
  const badge = solvedBadge(plat, p, cfState);
  const body = `<div class="card"><h1>${esc(title)}</h1><div>${pills.join('')}</div>${badge ? `<div>${badge}</div>` : ''}<div class="muted"><a href="${esc(link)}">${esc(link)}</a></div></div>
    ${p.content ? `<div class="statement">${prepContent(plat, p.content)}</div>` : '<p class="warn">No description available (Premium problem?).</p>'}`;
  return shell(title, body, DESC_CSS);
}

// ---------------- results ----------------

const RESULT_CSS = `
.banner{font-size:1.25em;font-weight:700;margin:6px 0 12px}
.rows{display:grid;grid-template-columns:max-content 1fr;gap:2px 16px;margin-bottom:14px}
.rows .k{opacity:.65}
.bar{height:8px;border-radius:4px;background:var(--vscode-panel-border,#555);overflow:hidden;margin:10px 0 14px;max-width:420px}
.bar>div{height:100%}
.bar .g{background:var(--vscode-testing-iconPassed,#3fb950)}.bar .r{background:var(--vscode-testing-iconFailed,#f85149)}
.case{border-left:3px solid var(--vscode-panel-border,#555);padding:4px 0 4px 14px;margin:0 0 14px}
.case.pass{border-color:var(--vscode-testing-iconPassed,#3fb950)}.case.fail{border-color:var(--vscode-testing-iconFailed,#f85149)}
.case .head{font-weight:600;margin-bottom:4px}
.f{display:grid;grid-template-columns:72px 1fr;gap:2px 10px;margin:2px 0}.f .k{opacity:.65}
.f pre{margin:0;padding:3px 8px}
.err pre{border-left:3px solid var(--vscode-testing-iconFailed,#f85149)}
.notes li{margin:3px 0}
`;

function resultHtml(m) {
  const parts = [];
  parts.push(`<div class="muted">${esc(m.heading)} · ${esc(m.sub)}</div>`);
  if (m.banner) parts.push(`<div class="banner ${m.banner.ok ? 'ok' : 'bad'}">${m.banner.ok ? '✔' : '✘'} ${esc(m.banner.text)}</div>`);
  if (m.progress && m.progress.total) {
    const pct = Math.round((100 * m.progress.passed) / m.progress.total);
    parts.push(`<div class="bar"><div class="${pct === 100 ? 'g' : 'r'}" style="width:${pct}%"></div></div>`);
  }
  if (m.rows && m.rows.length) parts.push(`<div class="rows">${m.rows.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="mono">${esc(v)}</div>`).join('')}</div>`);
  if (m.error) parts.push(`<div class="err"><div class="bad"><b>${esc(m.error.title)}</b></div><pre>${esc(cap(m.error.text))}</pre>${m.error.last ? `<div class="muted">Last test case: <code>${esc(m.error.last)}</code></div>` : ''}</div>`);
  for (const c of m.cases || []) {
    parts.push(`<div class="case ${c.ok ? 'pass' : 'fail'}"><div class="head"><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✔' : '✘'} ${esc(c.badge)}</span> &nbsp;${esc(c.label)} ${c.tag ? `<span class="muted">· ${esc(c.tag)}</span>` : ''}</div>`
      + c.fields.map(([k, v]) => `<div class="f"><div class="k">${esc(k)}</div><pre>${esc(cap(v))}</pre></div>`).join('') + '</div>');
  }
  if (m.notes && m.notes.length) parts.push(`<ul class="notes">${m.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
  if (m.link) parts.push(`<p>Submission page: <a href="${esc(m.link)}">${esc(m.link)}</a></p>`);
  return shell('Results', parts.join(''), RESULT_CSS);
}

// ---------------- sidebar ----------------

const SIDE_CSS = `
body{padding:8px 12px}
.tabs{display:flex;gap:4px;margin-bottom:10px}
.tab{flex:1;padding:4px 0;text-align:center;border:1px solid var(--vscode-panel-border,#555);background:transparent;color:var(--vscode-foreground);cursor:pointer;border-radius:3px}
.tab.on{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:transparent}
h2{font-size:1.05em;margin:.2em 0 .3em}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}
button.act{padding:5px 6px;border:none;border-radius:3px;cursor:pointer;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);font-family:inherit;font-size:inherit}
button.act:hover{background:var(--vscode-button-secondaryHoverBackground)}
button.pri{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}
button.pri:hover{background:var(--vscode-button-hoverBackground)}
.row{display:flex;gap:6px;margin-top:6px}.row button{flex:1}
.hint{opacity:.7;margin-top:10px;font-size:.92em}
`;

function sidebarHtml(st, nonce) {
  const tab = (id, name) => `<button class="tab ${st.plat === id ? 'on' : ''}" data-plat="${id}">${name}</button>`;
  let card;
  if (!st.problem) {
    card = `<h2 class="warn">No ${esc(st.platName)} problem yet</h2><div class="muted">Press “Change Problem” to pick one.</div>`;
  } else {
    const p = st.problem;
    const tagCls = st.plat === 'lc' ? diffClass(p.difficulty) : ratingClass(p.rating);
    const tagTxt = st.plat === 'lc' ? (p.difficulty || '-') : (p.rating || 'unrated');
    const badge = solvedBadge(st.plat, p, st.cfState);
    card = `<h2>${esc(st.title)}</h2><span class="pill ${tagCls}">● ${esc(tagTxt)}</span>${st.plat === 'cf' ? `<span class="pill">${esc(p.time_limit)} s</span>` : ''}
      ${badge ? `<div>${badge}</div>` : ''}${st.saved ? `<div class="warn">${st.saved} ${st.plat === 'lc' ? 'failed case' : 'custom test'}${st.saved === 1 ? '' : 's'}</div>` : ''}`;
  }
  const btn = (id, label, cls = '') => `<button class="act ${cls}" data-cmd="${id}">${label}</button>`;
  const body = `
    <div class="tabs">${tab('lc', 'LeetCode')}${tab('cf', 'Codeforces')}</div>
    ${card}
    <div class="grid">
      ${btn('test', '▶ Test', 'pri')}${btn('submit', '⬆ Submit', 'pri')}
      ${btn('description', 'Description')}${btn('openSolution', 'Open Solution')}
      ${btn('changeProblem', 'Change Problem')}${btn('savedTests', st.plat === 'lc' ? 'Failed Cases' : 'Custom Tests')}
    </div>
    <div class="row">${btn('prevProblem', '← Prev')}${btn('nextProblem', 'Next →')}${st.plat === 'lc' ? btn('dailyProblem', 'Daily') : ''}</div>
    <div class="row">${btn('chooseLanguage', 'Language: ' + esc(st.langName))}${btn('account', st.signed ? '● Signed in' : '○ Log in')}</div>
    <div class="hint">${esc(st.tip)}</div>`;
  const script = `const vs=acquireVsCodeApi();document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.dataset.cmd)vs.postMessage({type:'cmd',id:t.dataset.cmd});else if(t.dataset.plat)vs.postMessage({type:'plat',value:t.dataset.plat});});`;
  return shell('Leet-Forces', body, SIDE_CSS, script, nonce);
}

module.exports = { descriptionHtml, resultHtml, sidebarHtml };
