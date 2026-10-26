const path = require('path');
const S = require('./store');
const { run, compile, runCmd, sameOutput } = require('./runner');
const { AuthError, str, num, sleep, readJson, writeJson, decodeEntities, safeName, safeFetch, netError } = require('./util');

const BASE = 'https://codeforces.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

// ---------------- HTTP ----------------

async function headers(withCookie) {
  const a = await S.getAuth('cf');
  const h = { 'User-Agent': a.ua || UA };
  if (withCookie && a.cookie) h.Cookie = a.cookie;
  return h;
}

async function fetchPage(url) {
  let r;
  try { r = await safeFetch(url, { headers: await headers(true) }); }
  catch (e) { throw netError('Codeforces', e); }
  const body = await r.text();
  const cf = /Just a moment|cf-chl|challenge-platform/.test(body);
  if (r.status === 403 || r.status === 503 || cf) {
    throw new Error("Codeforces blocked the request (Cloudflare check).\nRun \"CP Runner: Log in / Account\" on Codeforces and add your browser's Cookie and User-Agent.");
  }
  if (r.status === 429) throw new Error('Rate limited by Codeforces (HTTP 429). Wait a bit and retry.');
  if (r.status < 200 || r.status >= 300) throw new Error(`Codeforces returned HTTP ${r.status}.`);
  return body;
}

/** Official API (no login needed). Returns the "result" field. */
async function api(method, query) {
  let r;
  try { r = await safeFetch(`${BASE}/api/${method}?${query}`, { headers: { ...(await headers(false)), Accept: 'application/json' } }); }
  catch (e) { throw netError('Codeforces', e); }
  let m;
  try { m = JSON.parse(await r.text()); }
  catch { throw new Error(`Codeforces API returned an unreadable response (HTTP ${r.status}).`); }
  if (m.status !== 'OK') throw new Error('Codeforces API: ' + (str(m.comment) || `request failed (HTTP ${r.status})`));
  return m.result;
}

async function verifyLogin() {
  const handle = S.cfHandle().toLowerCase();
  const page = await fetchPage(BASE + '/problemset/submit');
  return !!handle && page.toLowerCase().includes('/profile/' + handle);
}

// ---------------- solved marks ----------------

const marks = { solved: new Set(), names: new Set(), tried: new Set(), loaded: false, error: null };

let marksSeq = 0;
async function refreshSubmissions() {
  const my = ++marksSeq;
  const h = S.cfHandle();
  if (!h) { clearMarks(); return; }
  const solved = new Set(), names = new Set(), tried = new Set();
  try {
    for (const s of await api('user.status', 'handle=' + encodeURIComponent(h))) {
      const pr = s.problem || {};
      const key = (str(pr.contestId) + str(pr.index)).toUpperCase();
      const name = str(pr.name).toLowerCase();
      if (s.verdict === 'OK') { solved.add(key); if (name) names.add(name); }
      else tried.add(key);
    }
    if (my !== marksSeq) return;      // a newer refresh is in flight
    Object.assign(marks, { solved, names, tried, loaded: true, error: null });
  } catch (e) {
    if (my !== marksSeq) return;
    Object.assign(marks, { solved, names, tried, loaded: false, error: e.message });
  }
}
function clearMarks() { marksSeq++; Object.assign(marks, { solved: new Set(), names: new Set(), tried: new Set(), loaded: false, error: null }); }

/** "solved", "same", "tried" or null. */
function solvedState(p) {
  if (!marks.loaded || !p) return null;
  const key = str(p.code).toUpperCase();
  if (marks.solved.has(key)) return 'solved';
  if (marks.names.has(str(p.title).toLowerCase())) return 'same';
  if (marks.tried.has(key)) return 'tried';
  return null;
}

// ---------------- problem lookup + parsing ----------------

function getRef(value, current) {
  value = value.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (['n', 'next', 'p', 'prev'].includes(lower)) {
    if (!current || !current.index || !current.contest) return null;
    const ch = String.fromCharCode(current.index.charCodeAt(0) + (lower.startsWith('n') ? 1 : -1));
    return ch < 'A' || ch > 'Z' ? null : [str(current.contest), ch];
  }
  let m = /problemset\/problem\/(\d+)\/([A-Za-z]\d?)/i.exec(value);
  if (m) return [m[1], m[2].toUpperCase()];
  m = /(?:contest|gym)\/(\d+)\/problem\/([A-Za-z]\d?)/i.exec(value);
  if (m) return [m[1], m[2].toUpperCase()];
  m = /^(\d+)[\s/-]*([A-Za-z]\d?)$/.exec(value);
  if (m) return [m[1], m[2].toUpperCase()];
  return null;
}

const allMatches = (text, re) => Array.from(text.matchAll(re), (m) => m[1]);

function preText(h) {
  h = h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<[^>]+>/g, '');
  return decodeEntities(h).replace(/\r/g, '').replace(/\u00A0/g, ' ').replace(/^\n+|\n+$/g, '');
}

async function download(contest, index) {
  const html = await fetchPage(`${BASE}/problemset/problem/${contest}/${index}`);
  let start = html.indexOf('class="problem-statement"');
  if (start < 0) return null;
  start = Math.max(0, html.lastIndexOf('<div', start));
  let end = html.length;
  for (const marker of ['<script', 'id="sidebar"', 'id="footer"', '<div class="footer"']) {
    const mi = html.indexOf(marker, start + 100);
    if (mi > 0 && mi < end) end = mi;
  }
  const stmt = html.slice(start, end);

  const tm = /<div class="title">\s*([A-Za-z0-9]+)\.\s*(.*?)<\/div>/s.exec(stmt);
  const title = tm ? decodeEntities(tm[2].replace(/<[^>]+>/g, '')).trim() : '';
  const tl = /class="time-limit">.*?<\/div>\s*([0-9.]+)\s*second/s.exec(stmt);
  const ml = /class="memory-limit">.*?<\/div>\s*([0-9]+)\s*megabyte/s.exec(stmt);

  const ins = allMatches(stmt, /<div class="input">\s*<div class="title">Input<\/div>\s*<pre[^>]*>(.*?)<\/pre>/gs);
  const outs = allMatches(stmt, /<div class="output">\s*<div class="title">Output<\/div>\s*<pre[^>]*>(.*?)<\/pre>/gs);
  const samples = [];
  for (let i = 0; i < Math.min(ins.length, outs.length); i++) samples.push({ input: preText(ins[i]) + '\n', output: preText(outs[i]) });

  const rm = /title="Difficulty">[^<]*?\*(\d+)/i.exec(html);
  const tags = allMatches(html, /<span class="tag-box"[^>]*>\s*([^<]*?)\s*<\/span>/g)
    .map((t) => decodeEntities(t).replace(/\u00A0/g, ' ').trim()).filter((t) => t && !t.includes('*'));

  return {
    code: contest + index, contest, index, title, rating: rm ? rm[1] : '', tags,
    time_limit: tl ? parseFloat(tl[1]) : 2.0, memory: ml ? parseInt(ml[1], 10) : 256, samples, content: stmt,
  };
}

// ---------------- custom tests ----------------

function customFile(p) {
  const base = S.testsDir();
  const f = path.resolve(base, safeName(p.code) + '.json');
  if (path.dirname(f) !== path.resolve(base)) throw new Error('Refusing to use a tests path outside tests/.');
  return f;
}
function loadCustom(p) { const d = readJson(customFile(p), []); return Array.isArray(d) ? d : []; }
function saveCustom(p, list) { writeJson(customFile(p), list); }

// ---------------- test (local) ----------------

async function test(p, lang) {
  const model = { heading: 'Test', sub: S.problemTitle('cf', p), rows: [['Language', lang.name]], cases: [], notes: [] };
  const cases = [];
  (p.samples || []).forEach((m, i) => cases.push({ label: 'Sample ' + (i + 1), input: str(m.input), expected: str(m.output), flag: false }));
  const custom = loadCustom(p);
  custom.forEach((m, i) => { const inp = str(m.input); cases.push({ label: 'Custom ' + (i + 1), input: inp.endsWith('\n') ? inp : inp + '\n', expected: str(m.expected), flag: true }); });
  if (!cases.length) { model.banner = { ok: false, text: 'No sample tests. Add some with "Failed Cases / Custom Tests".' }; return model; }
  if (custom.length) model.notes.push(`${cases.length} test case(s), ${custom.length} custom.`);

  const c = await compile(lang);
  if (!c.ok) { model.banner = { ok: false, text: c.title }; model.error = { title: c.title, text: c.text }; return model; }

  const tl = typeof p.time_limit === 'number' ? p.time_limit : 2.0;
  const timeout = tl * 1000 * (lang.interpreted ? 6 : 3) + 2000;
  const [cmd, args] = runCmd(lang);
  let passed = 0;

  for (const cs of cases) {
    const r = await run(cmd, args, cs.input, timeout);
    if (r.failure) { model.banner = { ok: false, text: r.failure }; return model; }
    const actual = r.stdout.trim();
    const ok = !r.timedOut && !r.truncated && r.exit === 0 && sameOutput(actual, cs.expected);
    if (ok) passed++;
    const badge = ok ? 'PASS' : r.timedOut ? 'TIME LIMIT' : r.truncated ? 'OUTPUT LIMIT' : r.exit !== 0 ? 'RUNTIME ERROR' : 'WRONG ANSWER';
    const fields = [['input', cs.input.trim()], ['output', actual || '(empty)'], ['expected', cs.expected]];
    if (r.stderr.trim()) fields.push(['stderr', r.stderr.trim().split('\n').slice(0, 8).join('\n')]);
    model.cases.push({ ok, badge, label: cs.label, tag: (cs.flag ? 'custom · ' : '') + r.ms + ' ms', fields });
  }
  model.progress = { passed, total: cases.length };
  model.banner = { ok: passed === cases.length, text: `${passed}/${cases.length} passed` };
  model.notes.push(passed === cases.length ? 'All passing. Submit when ready.'
    : 'Fix the failing cases, then test again. Some problems accept several valid answers; the real judge may still accept yours.');
  return model;
}

// ---------------- submit ----------------

function verdictText(s) {
  const v = str(s.verdict), on = num(s.passedTestCount) + 1;
  switch (v) {
    case 'OK': return 'Accepted';
    case 'WRONG_ANSWER': return `Wrong answer on test ${on}`;
    case 'TIME_LIMIT_EXCEEDED': return `Time limit exceeded on test ${on}`;
    case 'MEMORY_LIMIT_EXCEEDED': return `Memory limit exceeded on test ${on}`;
    case 'RUNTIME_ERROR': return `Runtime error on test ${on}`;
    case 'IDLENESS_LIMIT_EXCEEDED': return `Idleness limit exceeded on test ${on}`;
    case 'PRESENTATION_ERROR': return `Presentation error on test ${on}`;
    case 'COMPILATION_ERROR': return 'Compilation error';
    default: { const t = v.replace(/_/g, ' ').toLowerCase(); return t ? t[0].toUpperCase() + t.slice(1) : 'Unknown'; }
  }
}

async function lastSubmissionId() {
  const l = await api('user.status', `handle=${encodeURIComponent(S.cfHandle())}&from=1&count=1`);
  return l.length ? num(l[0].id) : 0;
}

async function waitForVerdict(p, before, token, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (token && token.isCancellationRequested) throw new Error('Cancelled.');
    await sleep(2500);
    try {
      for (const s of await api('user.status', `handle=${encodeURIComponent(S.cfHandle())}&from=1&count=5`)) {
        if (num(s.id) <= before) continue;
        const pr = s.problem || {};
        if (str(pr.contestId) !== str(p.contest) || str(pr.index).toUpperCase() !== str(p.index).toUpperCase()) continue;
        const v = str(s.verdict);
        if (v && v !== 'TESTING') return s;
        break;
      }
    } catch { /* transient API error: keep polling */ }
  }
  throw new Error('Timed out waiting for the verdict. Check your status page on Codeforces.');
}

async function verdictModel(p, s) {
  const accepted = s.verdict === 'OK';
  await refreshSubmissions();
  return {
    heading: 'Submit', sub: S.problemTitle('cf', p),
    banner: { ok: accepted, text: verdictText(s).toUpperCase() },
    rows: [
      ['Language', str(s.programmingLanguage)],
      ['Time', `${num(s.timeConsumedMillis)} ms`],
      ['Memory', `${(num(s.memoryConsumedBytes) / 1048576).toFixed(1)} MB`],
      ['Tests', `${num(s.passedTestCount)} passed`],
    ],
    cases: [],
    notes: [accepted ? 'Nice work.' : 'Add the failing input as a custom test to reproduce it locally.'],
    link: `${BASE}/contest/${str(s.contestId)}/submission/${str(s.id)}`,
  };
}

const randomHex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const submitUrl = (p) => `${BASE}/problemset/submit?submittedProblemCode=${encodeURIComponent(str(p.contest) + str(p.index))}`;

/** Old behaviour: post the form straight from here. Returns the verdict model. */
async function submitDirect(p, lang, code, token) {
  const a = await S.getAuth('cf');
  if (!a.cookie) throw new AuthError('Direct submit needs your browser cookie.', true);
  const contest = str(p.contest), index = str(p.index);

  const page = await fetchPage(BASE + '/problemset/submit');
  if (!page.toLowerCase().includes('/profile/' + S.cfHandle().toLowerCase())) throw new AuthError('Codeforces says you are not logged in (cookie expired?).');
  const cm = /name=['"]csrf_token['"]\s+value=['"]([0-9a-fA-F]+)['"]/.exec(page) || /name=['"]X-Csrf-Token['"]\s+content=['"]([0-9a-fA-F]+)['"]/.exec(page);
  if (!cm) throw new Error('Could not find the CSRF token on the submit page.');
  const csrf = cm[1];

  const hidden = {};
  let formAction = null;
  const fi = page.indexOf('submitSolutionFormSubmitted');   // read the real form so we post what the browser would
  if (fi > 0) {
    const fs_ = page.lastIndexOf('<form', fi), fe = page.indexOf('</form>', fi);
    if (fs_ >= 0 && fe > fs_) {
      const form = page.slice(fs_, fe);
      const am = /<form[^>]*action=['"]([^'"]*)['"]/i.exec(form);
      if (am) formAction = decodeEntities(am[1]);
      for (const im of form.matchAll(/<input[^>]*type=['"]hidden['"][^>]*>/gi)) {
        const nm = /name=['"]([^'"]+)['"]/.exec(im[0]), vm = /value=['"]([^'"]*)['"]/.exec(im[0]);
        if (nm) hidden[nm[1]] = vm ? decodeEntities(vm[1]) : '';
      }
    }
  }
  const sel = /<select[^>]*name=['"]programTypeId['"][^>]*>(.*?)<\/select>/s.exec(page);
  if (!sel) throw new Error('Could not read the language list from Codeforces.');
  const options = Array.from(sel[1].matchAll(/<option[^>]*value=['"](\d+)['"][^>]*>(.*?)<\/option>/gs), (m) => [m[1], decodeEntities(m[2]).trim()]);
  let typeId = null;
  outer: for (const pref of lang.pick) for (const [id, name] of options) {
    if (name.toLowerCase().includes(pref.toLowerCase())) { typeId = id; break outer; }
  }
  if (!typeId) throw new Error(`Codeforces has no matching compiler for ${lang.name} right now.`);
  const before = await lastSubmissionId();

  const fields = { ...hidden, csrf_token: csrf };
  if (!fields.ftaa) fields.ftaa = randomHex(18);
  if (!fields.bfaa) fields.bfaa = randomHex(32);
  if (!fields._tta) fields._tta = '176';
  Object.assign(fields, { action: 'submitSolutionFormSubmitted', submittedProblemCode: contest + index, programTypeId: typeId, source: code, tabSize: '4', sourceFile: '' });
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);

  let postUrl = `${BASE}/problemset/submit?csrf_token=${csrf}`;
  if (formAction) {
    try { const u = new URL(formAction, BASE); if (u.origin === BASE) postUrl = u.href; } catch { /* keep default */ }
  }
  let r;
  try { r = await safeFetch(postUrl, { method: 'POST', body: fd, headers: { ...(await headers(true)), Origin: BASE, Referer: BASE + '/problemset/submit' } }, 30000, false); }
  catch (e) { throw netError('Codeforces', e); }
  const loc = r.headers.get('location') || '';
  if (Math.floor(r.status / 300) === 1 && loc.includes('/enter')) throw new AuthError('Codeforces sent you to the login page (cookie expired?).');
  if (Math.floor(r.status / 100) !== 3) {
    const body = await r.text();
    if (r.status === 403 || /Just a moment|challenge-platform/.test(body)) throw new Error('Codeforces blocked the request (Cloudflare). Use browser submit mode, or paste a fresh cookie + User-Agent.');
    for (const em of body.matchAll(/<span class="error[^"]*"[^>]*>(.*?)<\/span>/gs)) {
      const msg = decodeEntities(em[1].replace(/<[^>]+>/g, '')).trim();
      if (msg) throw new Error('Codeforces rejected the submission:\n' + msg);
    }
    throw new Error(`Codeforces answered HTTP ${r.status} but showed no error text.\nIt may refuse code that is too short, or identical to an earlier submission. Try browser submit mode.`);
  }
  return verdictModel(p, await waitForVerdict(p, before, token));
}

module.exports = {
  BASE, api, fetchPage, verifyLogin, marks, refreshSubmissions, clearMarks, solvedState, getRef, download,
  loadCustom, saveCustom, customFile, test, lastSubmissionId, waitForVerdict, verdictModel, submitDirect, submitUrl,
};
