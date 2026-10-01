// `pnpm dev:stop`: ends the dev servers left behind when `pnpm dev` is killed
// rather than stopped with Ctrl+C (common on Windows). Only Node processes
// listening on the web (3000) and Metro (8081) ports are ended; anything else
// on those ports is reported and left alone.
import { execFileSync } from 'node:child_process';

const PORTS = [3000, 8081];
const isWindows = process.platform === 'win32';

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return ''; // e.g. lsof exits 1 when nothing listens
  }
}

function listeningPids(port) {
  if (isWindows) {
    const pids = new Set();
    for (const line of run('netstat', ['-ano', '-p', 'TCP']).split(/\r?\n/)) {
      const [, local, , state, pid] = line.trim().split(/\s+/);
      if (state === 'LISTENING' && local?.endsWith(`:${port}`)) pids.add(Number(pid));
    }
    return [...pids];
  }
  return run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    .split('\n')
    .filter(Boolean)
    .map(Number);
}

function processName(pid) {
  if (isWindows) {
    const row = run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    return row.split(',')[0]?.replaceAll('"', '').trim() ?? '';
  }
  return run('ps', ['-p', String(pid), '-o', 'comm=']).trim();
}

let stopped = 0;
for (const port of PORTS) {
  for (const pid of listeningPids(port)) {
    const name = processName(pid);
    if (!/^node(\.exe)?$/i.test(name.split(/[\\/]/).pop() ?? '')) {
      console.log(
        `port ${port}: ${name || 'unknown'} (pid ${pid}) is not a Node dev server; left running`,
      );
      continue;
    }
    if (isWindows) run('taskkill', ['/PID', String(pid), '/T', '/F']);
    else process.kill(pid, 'SIGTERM');
    console.log(`port ${port}: stopped ${name} (pid ${pid})`);
    stopped++;
  }
}
console.log(
  stopped ? `Stopped ${stopped} dev server(s).` : 'No dev servers running on 3000 or 8081.',
);
