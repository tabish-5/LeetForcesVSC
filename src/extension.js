const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const S = require('./store');
const { LANGS } = require('./langs');
const lc = require('./leetcode');
const cf = require('./codeforces');
const views = require('./views');
const { AuthError, str, clip, readJson } = require('./util');

let sidebarView = null;
let resultPanel = null;
let descPanel = null;
let statusItems = {};

// ============================================================
// helpers
// ============================================================

const isLc = () => S.plat() === 'lc';
const info = (m, ...b) => vscode.window.showInformationMessage(m, ...b);

function progress(title, fn, cancellable = false) {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable }, (_p, token) => fn(token));
}

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) {
      const msg = e.missing ? `You are not logged in to ${S.platName()}.` : e.message;
      const pick = await vscode.window.showErrorMessage(msg, 'Log in');
      if (pick === 'Log in') await cmdAccount();
    } else {
      vscode.window.showErrorMessage(e && e.message ? e.message : String(e));
    }
  }
}

async function saveSolution(plat, lang) {
  const f = S.srcPath(plat, lang);
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === f);
  if (doc && doc.isDirty) await doc.save();
}

function currentProblem() { return S.loadProblem(S.plat()); }

async function requireProblem() {
  const p = currentProblem();
  if (!p) {
    const pick = await info(`No ${S.platName()} problem selected yet.`, 'Change Problem');
    if (pick) await cmdChangeProblem();
  }
  return p;
}

function savedCount(p) {
  if (!p) return 0;
  try { return isLc() ? lc.loadFailed(p).length : cf.loadCustom(p).length; } catch { return 0; }
}

function cfState(p) { return p && !isLc() ? cf.solvedState(p) : null; }

function refreshUI() {
  // sidebar
  if (sidebarView) sidebarView.webview.html = sidebarContent();
  // status bar
  let lang = S.lang();
  statusItems.platform.text = `$(code) ${isLc() ? 'LC' : 'CF'} · ${lang.name}`;
  statusItems.platform.tooltip = 'Leet-Forces: switch platform (click) — language is in settings';
  statusItems.test.text = '$(play) Test';
  statusItems.submit.text = '$(cloud-upload) Submit';
  Object.values(statusItems).forEach((i) => i.show());
}

function sidebarContent() {
  let p = null, root = true;
  try { S.root(); } catch { root = false; }
  const plat = S.plat();
  if (root) p = S.loadProblem(plat);
  const signed = S.signedIn(plat);
  let tip;
  if (!root) tip = 'Open a folder first: Leet-Forces stores solutions in your workspace.';
  else if (!p) tip = plat === 'lc' ? 'Start here: Change Problem, then enter a number like 1.' : 'Start here: Change Problem, then enter a code like 4A.';
  else if (plat === 'lc' && !signed) tip = 'To test or submit, log in first.';
  else if (plat === 'cf' && !S.cfHandle()) tip = 'Log in and set your handle to see solved marks.';
  else tip = `Write your code in ${path.basename(S.srcPath(plat))}, then press Test.`;
  const nonce = crypto.randomBytes(16).toString('hex');
  return views.sidebarHtml({
    plat, platName: S.platName(), problem: p, title: p ? S.problemTitle(plat, p) : '',
    cfState: cfState(p), saved: root ? savedCount(p) : 0, langName: S.lang().name, signed, tip,
  }, nonce);
}

function showPanel(kind, title, html, column, preserveFocus) {
  const holder = kind === 'result' ? resultPanel : descPanel;
  let panel = holder;
  if (!panel) {
    panel = vscode.window.createWebviewPanel(`leetforces.${kind}`, title, { viewColumn: column, preserveFocus: true }, { enableScripts: false, localResourceRoots: [] });
    panel.onDidDispose(() => { if (kind === 'result') resultPanel = null; else descPanel = null; });
    if (kind === 'result') resultPanel = panel; else descPanel = panel;
  }
  panel.title = title;
  panel.webview.html = html;
  panel.reveal(undefined, preserveFocus);
}

const showResult = (model) => showPanel('result', `Leet-Forces: ${model.heading}`, views.resultHtml(model), vscode.ViewColumn.Beside, true);

async function openFile(file, column = vscode.ViewColumn.One) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  await vscode.window.showTextDocument(doc, { viewColumn: column, preserveFocus: false });
}

// ============================================================
// commands
// ============================================================

async function cmdDescription() {
  const p = await requireProblem();
  if (!p) return;
  const plat = S.plat();
  const link = plat === 'lc' ? `${lc.BASE}/problems/${p.slug}/` : `${cf.BASE}/problemset/problem/${p.contest}/${p.index}`;
  showPanel('desc', 'Leet-Forces: ' + S.problemTitle(plat, p),
    views.descriptionHtml(plat, p, { cfState: cfState(p), link }), vscode.ViewColumn.Beside, true);
}

async function cmdOpenSolution() {
  const src = S.srcPath(S.plat());
  if (!fs.existsSync(src)) { info(`${path.basename(src)} does not exist. Select a problem first.`); return; }
  await openFile(src);
}

async function cmdTest() {
  const p = await requireProblem();
  if (!p) return;
  const plat = S.plat(), lang = S.lang();
  await saveSolution(plat, lang);
  const code = S.readSource(plat, lang);
  const model = await progress(plat === 'lc' ? 'Running on LeetCode…' : `Compiling and running ${lang.name}…`,
    (token) => (plat === 'lc' ? lc.test(p, code, lang, token) : cf.test(p, lang)), plat === 'lc');
  showResult(model);
}

async function cmdSubmit() {
  const p = await requireProblem();
  if (!p) return;
  const plat = S.plat(), lang = S.lang();
  await saveSolution(plat, lang);
  const code = S.readSource(plat, lang);

  if (plat === 'lc') {
    const model = await progress('Submitting to LeetCode…', (token) => lc.submit(p, code, lang, token), true);
    showResult(model);
    refreshUI();
    return;
  }
  await submitCf(p, lang, code);
}

async function submitCf(p, lang, code) {
  if (code.trim() === lang.template.trim()) {
    const pick = await vscode.window.showWarningMessage('Your file still contains only the starter code. Submit anyway?', { modal: true }, 'Submit anyway');
    if (!pick) return;
  }
  let mode = vscode.workspace.getConfiguration('leetforces').get('codeforces.submitMode', 'browser');
  if (mode === 'ask') {
    const pick = await vscode.window.showQuickPick([
      { label: 'Browser', description: 'you do the human check and click Submit', value: 'browser' },
      { label: 'Direct', description: 'send from here (needs a valid cookie)', value: 'direct' },
    ], { title: 'Codeforces submit mode' });
    if (!pick) return;
    mode = pick.value;
  }

  if (!S.cfHandle()) {
    const handle = await vscode.window.showInputBox({ title: 'Codeforces handle', prompt: 'Needed to find your verdict afterwards', ignoreFocusOut: true });
    if (!handle) return;
    const a = await S.getAuth('cf');
    a.handle = handle.trim();
    await S.setAuth('cf', a);
    refreshUI();
  }

  if (mode === 'direct') {
    const model = await progress('Submitting to Codeforces…', (token) => cf.submitDirect(p, lang, code, token), true);
    showResult(model);
    refreshUI();
    return;
  }

  // Browser-assisted: code on the clipboard, you pass the human check, we track the verdict.
  const before = await progress('Checking your latest submission…', () => cf.lastSubmissionId());
  await vscode.env.clipboard.writeText(code);
  await vscode.env.openExternal(vscode.Uri.parse(cf.submitUrl(p)));
  const pick = await vscode.window.showInformationMessage(
    'Finish in your browser',
    { modal: true, detail: `1. Your code is on the clipboard.\n2. Click the editor, select all, paste.\n3. Language: ${lang.pick[0].trim()} (or similar).\n4. Do the human verification and click Submit.\n\nThen press the button below so the verdict can be tracked.` },
    "I've clicked Submit");
  if (!pick) return;
  const verdict = await progress('Waiting for the verdict…', (token) => cf.waitForVerdict(p, before, token), true);
  showResult(await cf.verdictModel(p, verdict));
  refreshUI();
}

async function cmdChangeProblem(preset) {
  const plat = S.plat();
  S.root();
  let value = typeof preset === 'string' ? preset : undefined;
  if (value === undefined) {
    value = await vscode.window.showInputBox({
      title: `${S.platName()}: pick what to solve next`,
      prompt: plat === 'lc' ? 'Number, URL or slug. Shortcuts: n = next, p = previous, d = today’s daily' : 'Problem code or URL. Shortcuts: n = next letter, p = previous letter',
      placeHolder: plat === 'lc' ? '1   |   two-sum   |   https://leetcode.com/problems/sqrtx/' : '1900A   |   4/B1   |   https://codeforces.com/contest/1900/problem/C',
      ignoreFocusOut: true,
    });
  }
  if (!value || !value.trim()) return;

  const lang = S.lang();
  const problem = await progress('Loading problem…', async () => {
    const cur = S.loadProblem(plat);
    if (plat === 'lc') {
      const slug = await lc.getSlug(value, cur);
      if (!slug) throw new Error('Could not find that problem.');
      return lc.download(slug);
    }
    const ref = cf.getRef(value, cur);
    if (!ref) throw new Error('Could not understand that. Use something like 1900A.');
    const pr = await cf.download(ref[0], ref[1]);
    if (pr && S.cfHandle()) await cf.refreshSubmissions();
    return pr;
  });
  if (!problem) throw new Error('Problem was not found.');
  if (!S.validProblem(plat, problem)) throw new Error('The site returned an unexpected problem identifier; refusing to save it.');

  const starter = S.starterFor(plat, problem, lang);
  if (!starter) throw new Error(`LeetCode did not return ${lang.name} starter code for this problem. Choose another language.`);
  const src = S.srcPath(plat, lang);
  S.writeSource(src, starter, S.problemId(plat, problem));
  S.saveProblem(plat, problem);
  refreshUI();

  await openFile(src);
  await cmdDescription();

  const notes = [];
  const tried = isLc() ? problem.status === 'notac' : cf.solvedState(problem) === 'tried';
  const solved = isLc() ? problem.status === 'ac' : ['solved', 'same'].includes(cf.solvedState(problem));
  if (tried) notes.push('You have submitted this before without an accepted verdict.');
  if (solved) notes.push('You already have an accepted submission for this problem.');
  const saved = savedCount(problem);
  if (saved) notes.push(`${saved} ${isLc() ? 'failed case(s) from earlier submissions' : 'custom test(s)'} will run in Test.`);
  info(`${S.problemTitle(plat, problem)}: ${path.basename(src)} now holds the ${lang.name} starter code.${notes.length ? ' ' + notes.join(' ') : ''}`);
}

async function cmdNext() { await cmdChangeProblem('n'); }
async function cmdPrev() { await cmdChangeProblem('p'); }
async function cmdDaily() {
  if (!isLc()) { await S.setPlat('lc'); refreshUI(); }
  await cmdChangeProblem('d');
}

async function cmdChooseLanguage() {
  const cur = S.lang();
  const pick = await vscode.window.showQuickPick(
    LANGS.map((l) => ({ label: l.name, description: l.file, picked: l.key === cur.key, detail: l.key === cur.key ? 'current' : undefined, key: l.key })),
    { title: 'Language (shared by LeetCode and Codeforces)' });
  if (!pick) return;
  await vscode.workspace.getConfiguration('leetforces').update('language', pick.key, vscode.ConfigurationTarget.Global);
  const l = LANGS.find((x) => x.key === pick.key);
  const plat = S.plat();
  const p = S.loadProblem(plat);
  if (p) {
    const src = S.srcPath(plat, l);
    if (fs.existsSync(src) && S.fileTag(src) === S.problemId(plat, p)) {
      info(`Language set to ${l.name}. Using your existing ${path.basename(src)}.`);
    } else {
      const starter = S.starterFor(plat, p, l);
      if (!starter) { info(`Language set to ${l.name}, but LeetCode has no ${l.name} starter code for this problem.`); }
      else {
        S.writeSource(src, starter, S.problemId(plat, p));
        info(`Language set to ${l.name}. Created ${path.basename(src)} with starter code (anything there before is backed up in .leetforces/backup).`);
        await openFile(src);
      }
    }
  } else info(`Language set to ${l.name}.`);
  refreshUI();
}

async function cmdSwitchPlatform() { await setPlatform(isLc() ? 'cf' : 'lc'); }
async function setPlatform(plat) { await S.setPlat(plat); refreshUI(); }

// ---------------- failed cases / custom tests ----------------

async function cmdSavedTests() {
  const p = await requireProblem();
  if (!p) return;
  const lcMode = isLc();
  const list = lcMode ? lc.loadFailed(p) : cf.loadCustom(p);
  const file = lcMode ? lc.failedFile(p) : cf.customFile(p);
  const save = (l) => (lcMode ? lc.saveFailedList(p, l) : cf.saveCustom(p, l));

  const actions = [];
  if (!lcMode) actions.push({ label: '$(add) Add a custom test', id: 'add' });
  if (list.length) actions.push({ label: '$(trash) Delete one', id: 'del' }, { label: '$(clear-all) Clear all', id: 'clear' });
  actions.push({ label: '$(go-to-file) Open tests file', id: 'open' });
  const pick = await vscode.window.showQuickPick(actions, {
    title: `${lcMode ? 'Failed cases' : 'Custom tests'} for ${S.problemTitle(S.plat(), p)}`,
    placeHolder: list.length ? `${list.length} saved` : lcMode ? 'Nothing saved yet. Failing submissions are saved here automatically.' : 'No custom tests yet.',
  });
  if (!pick) return;

  if (pick.id === 'add') {
    const input = await vscode.window.showInputBox({ title: 'Custom test: input', prompt: 'Use \\n for line breaks', ignoreFocusOut: true });
    if (!input) return;
    const expected = await vscode.window.showInputBox({ title: 'Custom test: expected output', prompt: 'Use \\n for line breaks', ignoreFocusOut: true });
    if (!expected) return;
    list.push({ input: input.replace(/\\n/g, '\n') + '\n', expected: expected.replace(/\\n/g, '\n'), saved_at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    save(list);
    info('Saved. It runs with every Test.');
  } else if (pick.id === 'del') {
    const d = await vscode.window.showQuickPick(list.map((m, i) => ({ label: `#${i + 1}`, description: clip(str(m.input).trim(), 60), detail: str(m.expected) ? 'expected: ' + clip(m.expected, 60) : undefined, i })), { title: 'Delete which?' });
    if (d) { list.splice(d.i, 1); save(list); info('Deleted.'); }
  } else if (pick.id === 'clear') {
    const ok = await vscode.window.showWarningMessage('Delete all saved cases for this problem?', { modal: true }, 'Delete all');
    if (ok) { save([]); info('Cleared.'); }
  } else if (pick.id === 'open') {
    if (!fs.existsSync(file)) save([]);
    await openFile(file, vscode.ViewColumn.Beside);
  }
  refreshUI();
}

// ---------------- account ----------------

async function cmdAccount() {
  if (isLc()) await lcAccount(); else await cfAccount();
  refreshUI();
}

async function lcLogin() {
  const go = await vscode.window.showInformationMessage('How to get your LeetCode cookies',
    { modal: true, detail: '1. Log in to leetcode.com in your browser.\n2. Press F12 → Application (Chrome/Edge) or Storage (Firefox).\n3. Cookies → https://leetcode.com\n4. Copy the values of LEETCODE_SESSION and csrftoken.\n\nThey are stored in VS Code’s encrypted secret storage, never in your workspace.' }, 'Continue');
  if (!go) return;
  const clean = (s) => (s || '').replace(/["']/g, '').trim();
  const session = clean(await vscode.window.showInputBox({ title: 'LEETCODE_SESSION', password: true, ignoreFocusOut: true }));
  if (!session) return;
  const csrf = clean(await vscode.window.showInputBox({ title: 'csrftoken', password: true, ignoreFocusOut: true }));
  if (!csrf) return;
  const auth = { session, csrf };
  await S.setAuth('lc', auth);
  const name = await progress('Checking…', () => lc.verifyLogin(auth));
  if (name) { info(`Login successful. Signed in as ${name}.`); await lc.refreshStatus(); }
  else vscode.window.showWarningMessage('Cookies saved, but LeetCode did not accept them. Re-copy both values from your browser and try again.');
}

async function lcAccount() {
  const logged = S.signedIn('lc');
  let status = 'You are not logged in.';
  if (logged) {
    const name = await progress('Checking your session…', async () => { try { return await lc.verifyLogin(await S.getAuth('lc')); } catch { return null; } });
    status = name ? `Signed in as ${name}` : 'Cookies are saved, but LeetCode says you are NOT signed in (probably expired).';
  }
  const items = [{ label: logged ? 'Log in again' : 'Log in', id: 'login' }];
  if (logged) items.push({ label: 'Log out', id: 'logout' });
  const pick = await vscode.window.showQuickPick(items, { title: 'LeetCode account', placeHolder: status });
  if (!pick) return;
  if (pick.id === 'login') await lcLogin();
  else { await S.clearAuth('lc'); info('Logged out. Saved cookies deleted.'); }
}

async function cfAccount() {
  const handle = S.cfHandle();
  let status = handle ? `Handle: ${handle}` : 'No handle saved.';
  if (handle && S.signedIn('cf')) {
    const ok = await progress('Checking your session…', async () => { try { return await cf.verifyLogin(); } catch (e) { return 'err:' + str(e.message).split('\n')[0]; } });
    status += ok === true ? ' · cookie is valid, you can submit directly' : typeof ok === 'string' ? ` · could not check (${clip(ok.slice(4), 50)})` : ' · cookie saved, but Codeforces says you are NOT signed in';
  }
  const pick = await vscode.window.showQuickPick([
    { label: 'Set handle only', description: 'solved marks + verdict tracking (enough for browser submit)', id: 'handle' },
    { label: 'Full login (handle + cookie)', description: 'also enables direct submit', id: 'full' },
    { label: 'Log out', id: 'logout' },
  ], { title: 'Codeforces account', placeHolder: status });
  if (!pick) return;

  if (pick.id === 'logout') {
    await S.clearAuth('cf'); cf.clearMarks();
    info('Logged out. Saved data deleted.');
    return;
  }
  const a = await S.getAuth('cf');
  const h = await vscode.window.showInputBox({ title: 'Codeforces handle', value: a.handle || '', ignoreFocusOut: true });
  if (!h) return;
  a.handle = h.trim();
  if (pick.id === 'full') {
    const go = await vscode.window.showInformationMessage('How to get your Codeforces cookie',
      { modal: true, detail: '1. Log in to codeforces.com in your browser.\n2. Press F12 → Network tab, then reload the page.\n3. Click the first request (codeforces.com).\n4. In Request Headers copy the values of "cookie" and "user-agent".' }, 'Continue');
    if (!go) return;
    const cookie = ((await vscode.window.showInputBox({ title: 'Cookie', password: true, ignoreFocusOut: true })) || '').replace(/^cookie:\s*/i, '').replace(/"/g, '').trim();
    if (!cookie) return;
    const ua = ((await vscode.window.showInputBox({ title: 'User-Agent (empty = default)', ignoreFocusOut: true })) || '').replace(/^user-agent:\s*/i, '').trim();
    a.cookie = cookie; a.ua = ua;
  } else { a.cookie = a.cookie || ''; a.ua = a.ua || ''; }
  await S.setAuth('cf', a);

  await progress('Loading your submissions…', () => cf.refreshSubmissions());
  if (cf.marks.loaded) info(`Handle works. ${cf.marks.solved.size} solved problem(s) found.`);
  else vscode.window.showWarningMessage('Could not read your submissions: ' + clip(str(cf.marks.error), 80));
  if (pick.id === 'full') {
    let ok = false;
    try { ok = await cf.verifyLogin(); } catch (e) { vscode.window.showWarningMessage(clip(e.message.split('\n')[0], 120)); }
    if (ok) info('Cookie accepted.');
    else vscode.window.showWarningMessage('The cookie was not accepted. Re-copy cookie and user-agent from your browser.');
  }
}

// ============================================================
// sidebar
// ============================================================

const SIDEBAR_COMMANDS = new Set(['test', 'submit', 'description', 'openSolution', 'changeProblem', 'savedTests', 'prevProblem', 'nextProblem', 'dailyProblem', 'chooseLanguage', 'account']);

class Sidebar {
  resolveWebviewView(view) {
    sidebarView = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = sidebarContent();
    view.webview.onDidReceiveMessage(async (m) => {
      if (m && m.type === 'cmd' && SIDEBAR_COMMANDS.has(m.id)) await vscode.commands.executeCommand('leetforces.' + m.id);
      else if (m.type === 'plat') await setPlatform(m.value === 'cf' ? 'cf' : 'lc');
    });
    view.onDidChangeVisibility(() => { if (view.visible) view.webview.html = sidebarContent(); });
    view.onDidDispose(() => { if (sidebarView === view) sidebarView = null; });
  }
}

// ============================================================
// activation
// ============================================================

/** Copies state from the old ".cprunner" folder (Java tool / v1.0.x) once, so nothing is lost by the rename. */
function migrateOldFolder() {
  try {
    const oldDir = path.join(S.root(), '.cprunner'), newDir = path.join(S.root(), '.leetforces');
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) fs.cpSync(oldDir, newDir, { recursive: true });
  } catch { /* no workspace or read-only: skip */ }
}

/** Moves logins stored under the old extension name ("cprunner") into the new secret keys. */
async function migrateOldSecrets() {
  for (const plat of ['lc', 'cf']) {
    try {
      if (Object.keys(await S.getAuth(plat)).length) continue;
      const raw = await S.context.secrets.get('cprunner.auth.' + plat);
      if (raw) { await S.setAuth(plat, JSON.parse(raw)); await S.context.secrets.delete('cprunner.auth.' + plat); }
    } catch { /* ignore */ }
  }
}

/** Imports a login saved by the old command-line runner (auth.json in the workspace). */
async function importOldAuth() {
  let file = null;
  try {
    for (const d of ['.leetforces', '.cprunner']) {
      const f = path.join(S.root(), d, 'auth.json');
      if (fs.existsSync(f)) { file = f; break; }
    }
  } catch { return; }
  if (!file) return;
  const old = readJson(file, null);
  if (!old || typeof old !== 'object') return;
  const todo = [];
  for (const plat of ['lc', 'cf']) {
    if (old[plat] && typeof old[plat] === 'object' && Object.keys(await S.getAuth(plat)).length === 0) todo.push(plat);
  }
  if (!todo.length) return;
  const who = todo.map((p) => (p === 'cf' && old.cf.handle ? `Codeforces (handle: ${str(old.cf.handle).slice(0, 40)})` : S.platName(p))).join(', ');
  const ok = await vscode.window.showWarningMessage('Import saved login from .leetforces/auth.json?',
    { modal: true, detail: `This file is inside the workspace, so anyone who gave you this folder could have written it. Importing signs you in as: ${who}.\n\nOnly import it if you created it yourself.` }, 'Import');
  if (ok !== 'Import') return;
  let imported = false;
  for (const plat of todo) {
    const o = old[plat];
    const clean = plat === 'lc' ? { session: str(o.session), csrf: str(o.csrf) } : { handle: str(o.handle), cookie: str(o.cookie), ua: str(o.ua) };
    await S.setAuth(plat, clean); imported = true;
  }
  if (imported) info('Leet-Forces imported your saved login from .leetforces/auth.json. You can now delete that file.');
}

async function activate(context) {
  S.init(context);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('leetforces.sidebar', new Sidebar()));

  const mk = (id, cmd, prio) => {
    const i = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, prio);
    i.command = cmd;
    context.subscriptions.push(i);
    statusItems[id] = i;
  };
  mk('platform', 'leetforces.switchPlatform', 100);
  mk('test', 'leetforces.test', 99);
  mk('submit', 'leetforces.submit', 98);

  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand('leetforces.' + id, (...a) => guard(() => fn(...a))));
  reg('test', cmdTest);
  reg('submit', cmdSubmit);
  reg('description', cmdDescription);
  reg('changeProblem', cmdChangeProblem);
  reg('nextProblem', cmdNext);
  reg('prevProblem', cmdPrev);
  reg('dailyProblem', cmdDaily);
  reg('openSolution', cmdOpenSolution);
  reg('savedTests', cmdSavedTests);
  reg('chooseLanguage', cmdChooseLanguage);
  reg('switchPlatform', cmdSwitchPlatform);
  reg('account', cmdAccount);

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('leetforces')) refreshUI(); }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => refreshUI()));

  migrateOldFolder();
  refreshUI();

  // background: imports + solved marks (silent on failure)
  (async () => {
    await migrateOldSecrets();
    await importOldAuth();
    if (S.cfHandle()) { await cf.refreshSubmissions(); refreshUI(); }
    if (S.signedIn('lc')) { try { if (await lc.refreshStatus()) refreshUI(); } catch { /* ignore */ } }
  })().catch(() => {});
}

function deactivate() {}

module.exports = { activate, deactivate };
