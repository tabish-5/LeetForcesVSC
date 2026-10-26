const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { LANGS } = require('./langs');
const { readJson, writeJson, str } = require('./util');

let ctx = null;

const S = {
  init(c) { ctx = c; },
  get context() { return ctx; },

  // ---- folders (inside the opened workspace folder) ----
  root() {
    const f = vscode.workspace.workspaceFolders;
    if (!f || !f.length) throw new Error('Open a folder in VS Code first (File > Open Folder), Leet-Forces keeps your solutions there.');
    return f[0].uri.fsPath;
  },
  stateDir() { return path.join(S.root(), '.leetforces'); },
  testsDir() { return path.join(S.root(), 'tests'); },
  buildDir() { return path.join(S.stateDir(), 'build'); },
  backupDir() { return path.join(S.stateDir(), 'backup'); },
  problemFile(plat) { return path.join(S.stateDir(), plat + '_problem.json'); },
  filesFile() { return path.join(S.stateDir(), 'files.json'); },

  // ---- settings ----
  plat() { return ctx.workspaceState.get('platform', 'lc'); },
  setPlat(p) { return ctx.workspaceState.update('platform', p); },
  platName(p = S.plat()) { return p === 'lc' ? 'LeetCode' : 'Codeforces'; },
  langKey() { return vscode.workspace.getConfiguration('leetforces').get('language', 'cpp'); },
  lang() { return LANGS.find((l) => l.key === S.langKey()) || LANGS[0]; },
  ext(l) { return path.extname(l.file); },
  srcPath(plat, l = S.lang()) {
    return plat === 'lc' ? path.join(S.root(), 'lc_solution' + S.ext(l)) : path.join(S.root(), l.file);
  },

  // ---- auth (SecretStorage; cookies never touch the workspace) ----
  async getAuth(plat) {
    const s = await ctx.secrets.get('leetforces.auth.' + plat);
    try { return s ? JSON.parse(s) : {}; } catch { return {}; }
  },
  async setAuth(plat, data) {
    await ctx.secrets.store('leetforces.auth.' + plat, JSON.stringify(data));
    await ctx.globalState.update('signed.' + plat, plat === 'lc' ? !!(data.session && data.csrf) : !!data.cookie);
    if (plat === 'cf') await ctx.globalState.update('cfHandle', data.handle || '');
  },
  async clearAuth(plat) {
    await ctx.secrets.delete('leetforces.auth.' + plat);
    await ctx.globalState.update('signed.' + plat, false);
    if (plat === 'cf') await ctx.globalState.update('cfHandle', '');
  },
  signedIn(plat = S.plat()) { return !!ctx.globalState.get('signed.' + plat, false); },
  cfHandle() { return ctx.globalState.get('cfHandle', ''); },

  // ---- problems ----
  /** Problem files live in the workspace, so they are untrusted: reject anything that could escape a path or URL. */
  validProblem(plat, p) {
    if (!p || typeof p !== 'object') return false;
    const ok = (v) => /^[A-Za-z0-9_-]+$/.test(str(v));
    return plat === 'lc'
      ? ok(p.slug) && ok(p.number) && /^\d+$/.test(str(p.question_id))
      : ok(p.code) && ok(p.contest) && ok(p.index);
  },
  loadProblem(plat = S.plat()) {
    try { const p = readJson(S.problemFile(plat)); return S.validProblem(plat, p) ? p : null; } catch { return null; }
  },
  saveProblem(plat, p) { writeJson(S.problemFile(plat), p); },

  /** Writes a source file, backing up whatever was there, and remembers which problem it belongs to. */
  writeSource(src, content, id) {
    if (fs.existsSync(src)) {
      const old = fs.readFileSync(src, 'utf8');
      if (old.trim() && old !== content) {
        fs.mkdirSync(S.backupDir(), { recursive: true });
        const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
        fs.writeFileSync(path.join(S.backupDir(), stamp + '-' + path.basename(src)), old);
      }
    }
    fs.writeFileSync(src, content);
    const files = readJson(S.filesFile(), {});
    files[path.basename(src)] = id;
    writeJson(S.filesFile(), files);
  },
  fileTag(src) { return str(readJson(S.filesFile(), {})[path.basename(src)]); },

  problemId(plat, p) { return plat === 'lc' ? 'lc:' + p.number : 'cf:' + p.code; },
  problemTitle(plat, p) { return plat === 'lc' ? `#${p.number} ${p.title}` : `${p.code} · ${p.title}`; },

  starterFor(plat, p, l) {
    if (plat === 'lc') return str(p.snippets && p.snippets[l.lc]) || null;
    return l.template;
  },

  readSource(plat, l = S.lang()) {
    const src = S.srcPath(plat, l);
    const name = path.basename(src);
    if (!fs.existsSync(src)) throw new Error(`${name} does not exist. Choose a problem first, or change the language.`);
    let code = fs.readFileSync(src, 'utf8');
    if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
    if (!code.trim()) throw new Error(`${name} is empty.`);
    return code;
  },
};

module.exports = S;
