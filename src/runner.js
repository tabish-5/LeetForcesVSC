const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = require('./store');

const BATCH_TOOLS = new Set(['kotlinc', 'scalac', 'scala']);
const isWin = process.platform === 'win32';

const MAX_OUT = 1 << 20;   // 1 MB per run
const os = require('os');

/** Runs a command, feeds stdin, enforces a timeout and an output cap. Never rejects, never hangs. */
function run(cmd, args, stdin, timeoutMs) {
  return new Promise((resolve) => {
    const r = { exit: 0, stdout: '', stderr: '', failure: null, timedOut: false, truncated: false, ms: 0 };
    const t0 = Date.now();
    const batch = isWin && BATCH_TOOLS.has(cmd);
    if (batch && args.some((x) => /[&|<>^%!"\r\n]/.test(x))) {
      r.failure = 'A path contains characters that are unsafe for cmd.exe (& | < > ^ % ! "). Move your project to a folder without them.';
      r.exit = -1;
      return resolve(r);
    }
    const a = batch ? args.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : args;
    let child, finished = false, timer, grace, size = 0;
    const out = [], err = [];

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(grace);
      r.ms = Date.now() - t0;
      r.stdout = Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n');
      r.stderr = Buffer.concat(err).toString('utf8').replace(/\r\n/g, '\n');
      resolve(r);
    };
    // Kill the whole process tree, then stop waiting even if a grandchild keeps the pipes open.
    const kill = () => {
      try {
        if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else process.kill(-child.pid, 'SIGKILL');
      } catch { try { child.kill('SIGKILL'); } catch { /* ignore */ } }
      clearTimeout(grace);
      grace = setTimeout(finish, 500);
    };
    const collect = (arr) => (d) => {
      if (size >= MAX_OUT) { if (!r.truncated) { r.truncated = true; kill(); } return; }
      const room = MAX_OUT - size;
      arr.push(d.length > room ? d.subarray(0, room) : d);
      size += Math.min(d.length, room);
    };

    // Neutral cwd: on Windows a binary in the workspace must not shadow g++/python/node.
    try { child = spawn(cmd, a, { cwd: os.tmpdir(), shell: batch, detached: !isWin }); }
    catch { r.failure = `Could not start '${cmd}'. Is it installed and on your PATH?`; r.exit = -1; return finish(); }

    child.on('error', () => { r.failure = `Could not start '${cmd}'. Is it installed and on your PATH?`; r.exit = -1; finish(); });
    child.stdout.on('data', collect(out));
    child.stderr.on('data', collect(err));
    child.on('close', (code) => { if (r.exit === 0) r.exit = code == null ? -1 : code; finish(); });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin || '');
    timer = setTimeout(() => { r.timedOut = true; kill(); }, timeoutMs);
  });
}

const exePath = () => path.join(S.buildDir(), isWin ? 'sol.exe' : 'sol');

function compileCmd(l) {
  const f = S.srcPath('cf', l), exe = exePath(), bd = S.buildDir();
  switch (l.key) {
    case 'c': return ['gcc', ['-O2', '-std=c11', '-o', exe, f, '-lm']];
    case 'cpp': return ['g++', ['-O2', '-std=c++17', '-o', exe, f]];
    case 'java': return ['javac', ['-d', bd, f]];
    case 'kotlin': return ['kotlinc', [f, '-include-runtime', '-d', path.join(bd, 'sol.jar')]];
    case 'go': return ['go', ['build', '-o', exe, f]];
    case 'rust': return ['rustc', ['-O', '-o', exe, f]];
    case 'scala': return ['scalac', ['-d', bd, f]];
    default: return null;
  }
}

function runCmd(l) {
  const f = S.srcPath('cf', l), exe = exePath(), bd = S.buildDir();
  switch (l.key) {
    case 'c': case 'cpp': case 'go': case 'rust': return [exe, []];
    case 'java': return ['java', ['-cp', bd, 'Main']];
    case 'kotlin': return ['java', ['-jar', path.join(bd, 'sol.jar')]];
    case 'scala': return ['scala', ['-cp', bd, 'Main']];
    case 'csharp': return ['dotnet', [path.join(bd, 'csout', 'sol.dll')]];
    case 'python': return [isWin ? 'python' : 'python3', [f]];
    case 'javascript': return ['node', [f]];
    case 'ruby': return ['ruby', [f]];
    default: return ['php', [f]];
  }
}

/** Compiles if needed. Returns {ok:true} or {ok:false,title,text}. */
async function compile(l) {
  fs.mkdirSync(S.buildDir(), { recursive: true });
  try { fs.rmSync(exePath(), { force: true }); } catch { /* ignore */ }
  if (l.interpreted) return { ok: true };

  let r;
  if (l.key === 'csharp') {
    const v = await run('dotnet', ['--version'], null, 20000);
    if (v.failure) return { ok: false, title: 'COMPILER NOT FOUND', text: v.failure };
    const major = parseInt(v.stdout.trim().split('.')[0], 10) || 8;
    const dir = path.join(S.buildDir(), 'cs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sol.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${major}.0</TargetFramework><Nullable>disable</Nullable><ImplicitUsings>disable</ImplicitUsings><AssemblyName>sol</AssemblyName></PropertyGroup></Project>`);
    fs.copyFileSync(S.srcPath('cf', l), path.join(dir, 'Program.cs'));
    r = await run('dotnet', ['build', dir, '-c', 'Release', '-o', path.join(S.buildDir(), 'csout'), '--nologo', '-v', 'q'], null, 180000);
  } else {
    const [cmd, args] = compileCmd(l);
    r = await run(cmd, args, null, 180000);
  }
  if (r.failure) return { ok: false, title: 'COMPILER NOT FOUND', text: r.failure };
  if (r.exit !== 0 || r.timedOut) {
    const lines = (r.stderr + '\n' + r.stdout).trim().split('\n');
    const text = lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n...' : '');
    return { ok: false, title: r.timedOut ? 'COMPILER TIMED OUT' : 'COMPILE ERROR', text };
  }
  return { ok: true };
}

function sameOutput(actual, expected) {
  const a = actual.trim(), e = expected.trim();
  if (!a || !e) return a === e;
  const at = a.split(/\s+/), et = e.split(/\s+/);
  if (at.length !== et.length) return false;
  for (let i = 0; i < at.length; i++) {
    if (at[i] === et[i]) continue;
    if (et[i].includes('.')) {      // decimals: accept tiny differences like the judge usually does
      const x = parseFloat(at[i]), y = parseFloat(et[i]);
      if (!isNaN(x) && !isNaN(y) && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y))) continue;
    }
    return false;
  }
  return true;
}

module.exports = { run, compile, runCmd, sameOutput };
