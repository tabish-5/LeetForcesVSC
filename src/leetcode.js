const path = require('path');
const fs = require('fs');
const S = require('./store');
const { AuthError, str, squash, sleep, clip, readJson, writeJson, safeName, safeFetch, netError } = require('./util');

const BASE = 'https://leetcode.com';
const API = BASE + '/graphql';
const JUDGE_TIMEOUT_MS = 90_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

// ---------------- HTTP ----------------

async function httpJson(url, body, headers) {
  const h = { Accept: 'application/json', 'User-Agent': UA, Referer: BASE + '/', ...(headers || {}) };
  const init = { method: body ? 'POST' : 'GET', headers: h };
  if (body) { h['Content-Type'] = 'application/json'; init.body = typeof body === 'string' ? body : JSON.stringify(body); }
  let r;
  try { r = await safeFetch(url, init); }
  catch (e) { throw netError('LeetCode', e); }
  const code = r.status;
  const text = await r.text();
  if (code === 401 || code === 403) {
    if (headers && headers.Cookie) throw new AuthError(`LeetCode rejected your session (HTTP ${code}). Your cookies may have expired, or the request was blocked.`);
    throw new Error(`LeetCode denied the request (HTTP ${code}).`);
  }
  if (code === 429) throw new Error('Rate limited by LeetCode (HTTP 429). Wait a bit and retry.');
  if (code < 200 || code >= 300) throw new Error(`LeetCode returned HTTP ${code}.\n${clip(text, 300)}`);
  try { return JSON.parse(text); }
  catch { throw new Error('LeetCode returned a non-JSON response (possibly a bot check).'); }
}

async function graphql(query, variables, operation, headers) {
  const payload = { query, variables: variables || {} };
  if (operation) payload.operationName = operation;
  const result = await httpJson(API, payload, headers);
  if (Array.isArray(result.errors) && result.errors.length) {
    throw new Error('LeetCode GraphQL error:\n' + result.errors.map((e) => str(e.message)).filter(Boolean).join('\n'));
  }
  return result.data || {};
}

async function authHeaders(slug) {
  const a = await S.getAuth('lc');
  if (!a.session || !a.csrf) throw new AuthError('You are not logged in to LeetCode.', true);
  return {
    Cookie: `LEETCODE_SESSION=${a.session}; csrftoken=${a.csrf}`,
    'x-csrftoken': str(a.csrf),
    Origin: BASE,
    Referer: `${BASE}/problems/${slug}/`,
  };
}

async function maybeHeaders(slug) {
  try { return await authHeaders(slug); } catch (e) { if (e instanceof AuthError) return undefined; throw e; }
}

/** Returns the username if the cookies are valid, else null. */
async function verifyLogin(auth) {
  const h = { Cookie: `LEETCODE_SESSION=${auth.session}; csrftoken=${auth.csrf}`, 'x-csrftoken': str(auth.csrf), Origin: BASE };
  try {
    const r = await httpJson(API, { operationName: 'globalData', query: 'query globalData { userStatus { isSignedIn username } }', variables: {} }, h);
    const st = r && r.data && r.data.userStatus;
    if (st && st.isSignedIn) return str(st.username);
  } catch (e) { if (!(e instanceof AuthError)) throw e; }
  return null;
}

// ---------------- problem lookup ----------------

async function dailySlug() {
  const d = await graphql('query questionOfToday { activeDailyCodingChallengeQuestion { question { titleSlug } } }', null, 'questionOfToday');
  return str(d.activeDailyCodingChallengeQuestion && d.activeDailyCodingChallengeQuestion.question && d.activeDailyCodingChallengeQuestion.question.titleSlug) || null;
}

function matchNumber(questions, target) {
  for (const q of questions || []) {
    const id = str(q.questionFrontendId).trim().replace(/^0+/, '') || '0';
    if (id === target && q.titleSlug) return str(q.titleSlug);
  }
  return null;
}

async function searchV2(target) {
  const q = 'query problemsetQuestionListV2($limit: Int, $skip: Int, $searchKeyword: String, $categorySlug: String) { problemsetQuestionListV2(limit: $limit, skip: $skip, searchKeyword: $searchKeyword, categorySlug: $categorySlug) { questions { titleSlug questionFrontendId } } }';
  const d = await graphql(q, { limit: 100, skip: 0, searchKeyword: target, categorySlug: 'all-code-essentials' }, 'problemsetQuestionListV2');
  return matchNumber(d.problemsetQuestionListV2 && d.problemsetQuestionListV2.questions, target);
}

async function searchV1(target) {
  const q = 'query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) { problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) { questions: data { questionFrontendId titleSlug } } }';
  const d = await graphql(q, { categorySlug: '', limit: 50, skip: 0, filters: { searchKeywords: target } }, 'problemsetQuestionList');
  return matchNumber(d.problemsetQuestionList && d.problemsetQuestionList.questions, target);
}

async function findSlugByNumber(number) {
  const target = number.replace(/^0+/, '') || '0';
  let last = null;
  for (let i = 0; i < 2; i++) {
    try {
      const slug = i === 0 ? await searchV2(target) : await searchV1(target);
      if (slug) return slug;
    } catch (e) { last = e; }
  }
  if (last) throw last;
  return null;
}

async function getSlug(value, current) {
  value = value.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (['d', 'daily', 'today'].includes(lower)) return dailySlug();
  if (['n', 'next', 'p', 'prev'].includes(lower) && current && /^\d+$/.test(str(current.number))) {
    const n = parseInt(current.number, 10) + (lower.startsWith('n') ? 1 : -1);
    return n < 1 ? null : findSlugByNumber(String(n));
  }
  const m = /leetcode\.com\/problems\/([^/?#]+)/i.exec(value);
  if (m) return m[1].toLowerCase();
  if (/^\d+$/.test(value)) return findSlugByNumber(value);
  if (/^[A-Za-z0-9-]+$/.test(value)) return lower;
  return null;
}

async function download(slug) {
  const query = 'query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId questionFrontendId title titleSlug difficulty content isPaidOnly status sampleTestCase exampleTestcases metaData codeSnippets { langSlug lang code } } }';
  const headers = await maybeHeaders(slug);   // "status" needs your login
  const q = (await graphql(query, { titleSlug: slug }, 'questionData', headers)).question;
  if (!q) return null;

  const { LANGS } = require('./langs');
  const snippets = {};
  for (const sn of q.codeSnippets || []) {
    let code = str(sn.code);
    if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
    for (const l of LANGS) if (l.lc.toLowerCase() === str(sn.langSlug).toLowerCase() && code) snippets[l.lc] = code;
  }
  if (!Object.keys(snippets).length) {
    if (q.isPaidOnly) throw new Error('This is a Premium problem; LeetCode did not return its code.');
    throw new Error('LeetCode did not return starter code for this problem.');
  }
  const params = [];
  try { for (const p of JSON.parse(str(q.metaData)).params || []) params.push(`${str(p.name)} (${str(p.type)})`); } catch { /* ignore */ }
  const sample = str(q.sampleTestCase), examples = str(q.exampleTestcases);
  return {
    question_id: str(q.questionId), number: str(q.questionFrontendId), title: str(q.title), slug: str(q.titleSlug || slug),
    difficulty: str(q.difficulty), status: str(q.status), content: str(q.content),
    sample, examples: examples || sample, params, snippets,
  };
}

/** Refreshes the solved status of the saved problem. Silent on failure. */
async function refreshStatus() {
  const p = S.loadProblem('lc');
  if (!p || !S.signedIn('lc')) return false;
  try {
    const h = await authHeaders(p.slug);
    const d = await graphql('query s($titleSlug: String!) { question(titleSlug: $titleSlug) { status } }', { titleSlug: p.slug }, 's', h);
    const st = str(d.question && d.question.status);
    if (st || p.status !== 'ac') { p.status = st; S.saveProblem('lc', p); return true; }
  } catch { /* ignore */ }
  return false;
}

// ---------------- failed cases ----------------

function failedFile(p) {
  const base = S.testsDir();
  const f = path.resolve(base, `${safeName(p.number)}-${safeName(p.slug)}.json`);
  if (path.dirname(f) !== path.resolve(base)) throw new Error('Refusing to use a tests path outside tests/.');
  return f;
}
function loadFailed(p) { const d = readJson(failedFile(p), []); return Array.isArray(d) ? d : []; }
function saveFailedList(p, list) { writeJson(failedFile(p), list); }

/** Returns "new", "exists" or null. */
function saveFailedCase(p, res) {
  const input = str(res.last_testcase).replace(/^\n+|\n+$/g, '');
  if (!input || str(res.compile_error) || str(res.full_compile_error)) return null;
  const expected = str(res.expected_output);
  const cases = loadFailed(p);
  const key = squash(input);
  for (const m of cases) {
    if (squash(m.input) === key) {
      if (expected && !str(m.expected)) { m.expected = expected; saveFailedList(p, cases); }
      return 'exists';
    }
  }
  cases.push({ input, expected, verdict: str(res.status_msg), saved_at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  saveFailedList(p, cases);
  return 'new';
}

function splitCases(text, per) {
  const t = str(text).replace(/^\n+|\n+$/g, '');
  if (!t.trim()) return [];
  const lines = t.split('\n'), out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per).join('\n'));
  return out;
}
function paramsPerCase(p) {
  const s = str(p.sample).replace(/\n+$/, '');
  return s ? s.split('\n').length : 1;
}

// ---------------- judge ----------------

function judgeBody(p, code, dataInput, lang) {
  const body = {};
  if (dataInput != null) body.data_input = dataInput;
  body.lang = lang.lc;
  body.question_id = Number(p.question_id);
  body.test_mode = false;
  body.typed_code = code;
  body.judge_type = 'large';
  return body;
}

async function judge(url, p, body, token) {
  const headers = await authHeaders(p.slug);
  const started = await httpJson(url, body, headers);
  const id = started.interpret_id != null ? started.interpret_id : started.submission_id;
  if (id == null) throw new Error('LeetCode did not accept the request:\n' + clip(JSON.stringify(started), 300));
  const checkUrl = `${BASE}/submissions/detail/${id}/check/`;
  const deadline = Date.now() + JUDGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (token && token.isCancellationRequested) throw new Error('Cancelled.');
    await sleep(1000);
    const r = await httpJson(checkUrl, null, headers);
    if (r.state === 'SUCCESS') return { id: String(id), res: r };
  }
  throw new Error("Timed out waiting for LeetCode's verdict.");
}

function errorsOf(res) {
  const compile = str(res.full_compile_error) || str(res.compile_error);
  const runtime = str(res.full_runtime_error) || str(res.runtime_error);
  const title = compile ? 'COMPILE ERROR' : runtime ? 'RUNTIME ERROR' : null;
  if (!title) return null;
  return { title, text: compile || runtime, last: str(res.last_testcase) };
}

// ---------------- test / submit (return result models for the results view) ----------------

async function test(p, code, lang, token) {
  const per = paramsPerCase(p);
  const cases = [];
  splitCases(p.examples, per).forEach((inp, i) => cases.push({ label: 'Example ' + (i + 1), input: inp, expected: null, flag: false }));
  const saved = loadFailed(p);
  saved.forEach((m, i) => cases.push({ label: 'Failed ' + (i + 1), input: str(m.input), expected: str(m.expected) || null, flag: true }));

  const model = { heading: 'Test', sub: S.problemTitle('lc', p), rows: [['Language', lang.name]], cases: [], notes: [] };
  if (!cases.length) { model.banner = { ok: false, text: 'This problem has no example test cases.' }; return model; }
  if (saved.length) model.notes.push(`${cases.length} test case(s), ${saved.length} saved from failed submissions.`);

  const { res } = await judge(`${BASE}/problems/${p.slug}/interpret_solution/`, p,
    judgeBody(p, code, cases.map((c) => c.input).join('\n'), lang), token);

  const err = errorsOf(res);
  if (err) { model.banner = { ok: false, text: err.title }; model.error = err; return model; }
  if (!res.run_success && str(res.status_msg)) { model.banner = { ok: false, text: str(res.status_msg) }; return model; }

  const got = res.code_answer || [], exp = res.expected_code_answer || [], stdout = res.std_output_list || [];
  let passed = 0;
  cases.forEach((c, i) => {
    const actual = i < got.length ? str(got[i]) : '(no output)';
    const expected = c.expected != null ? c.expected : i < exp.length ? str(exp[i]) : '?';
    const ok = squash(actual) === squash(expected);
    if (ok) passed++;
    const fields = [['input', c.input], ['output', actual], ['expected', expected]];
    if (i < stdout.length && str(stdout[i]).trim()) fields.push(['stdout', str(stdout[i]).trim()]);
    model.cases.push({ ok, badge: ok ? 'PASS' : 'FAIL', label: c.label, tag: c.flag ? 'saved failure' : '', fields });
  });
  model.progress = { passed, total: cases.length };
  model.banner = { ok: passed === cases.length, text: `${passed}/${cases.length} passed` };
  if (str(res.status_runtime)) model.rows.push(['Runtime', str(res.status_runtime)]);
  model.notes.push(passed === cases.length ? 'All passing. Submit when ready.' : 'Fix the failing cases, then test again.');
  return model;
}

async function submit(p, code, lang, token) {
  let jr;
  try {
    jr = await judge(`${BASE}/problems/${p.slug}/submit/`, p, judgeBody(p, code, null, lang), token);
  } catch (e) {
    if (e instanceof AuthError && !e.missing) {
      throw new Error(e.message + '\nLeetCode may be asking for a human check, or your login expired (run "CP Runner: Log in / Account").');
    }
    throw e;
  }
  const { res, id } = jr;
  const status = str(res.status_msg) || 'Unknown';
  const accepted = status === 'Accepted';
  const total = str(res.total_testcases);

  const model = { heading: 'Submit', sub: S.problemTitle('lc', p), banner: { ok: accepted, text: status.toUpperCase() }, rows: [['Language', lang.name]], cases: [], notes: [] };
  if (total && total !== '0') {
    const correct = Number(str(res.total_correct) || 0);
    model.rows.push(['Test cases', `${correct}/${total}`]);
    model.progress = { passed: correct, total: Number(total) };
  }
  if (accepted) {
    const pct = (v) => (typeof v === 'number' ? `  (beats ${v.toFixed(2)}%)` : '');
    model.rows.push(['Runtime', str(res.status_runtime) + pct(res.runtime_percentile)]);
    model.rows.push(['Memory', str(res.status_memory) + pct(res.memory_percentile)]);
    model.notes.push('Nice work.');
    p.status = 'ac';
  } else {
    const err = errorsOf(res);
    if (err) model.error = err;
    else {
      if (str(res.last_testcase)) model.rows.push(['Failed on', clip(res.last_testcase, 200)]);
      if (res.expected_output != null) { model.rows.push(['Expected', str(res.expected_output)]); model.rows.push(['Output', str(res.code_output)]); }
    }
    const outcome = saveFailedCase(p, res);
    if (outcome === 'new') model.notes.push('Saved this failing case. It now runs with every Test.');
    if (outcome === 'exists') model.notes.push('This failing case is already saved in your Test set.');
    if (p.status !== 'ac') p.status = 'notac';
  }
  S.saveProblem('lc', p);
  model.link = `${BASE}/problems/${p.slug}/submissions/${id}/`;
  return model;
}

module.exports = {
  BASE, verifyLogin, getSlug, download, refreshStatus, loadFailed, saveFailedList, failedFile, test, submit,
};
