import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// When the backups store refuses (Vercel Blob at a Hobby limit, decision #93 D1), the backup
// and the restore check exit non-zero, so the run turns red and GitHub emails the owner;
// they never pass silently, and the token never appears in what they print.

const TOKEN = 'vercel_blob_rw_teststore_NeverPrintThisSecret123';
let server: Server;
let api = '';
let dir = '';
const seen: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'store_suspended', message: 'Store suspended' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = await mkdtemp(path.join(tmpdir(), 'oda-blob-stop-'));
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

function run(script: string, arg: string) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', `scripts/backup/${script}`, arg], {
      cwd: path.resolve(__dirname, '../..'),
      env: {
        ...process.env,
        BACKUP_TARGET: 'production',
        BACKUP_BLOB_READ_WRITE_TOKEN: TOKEN,
        VERCEL_BLOB_API_URL: api,
        VERCEL_BLOB_RETRIES: '0',
      },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ code, output }));
  });
}

describe('backups while the store refuses every call', () => {
  it('the nightly upload exits 1 with a message, never the token', async () => {
    const file = path.join(dir, 'oda.dump.gpg');
    await writeFile(file, 'encrypted bytes');
    const { code, output } = await run('upload.ts', file);
    expect(code).toBe(1);
    expect(output).toContain('Backup upload failed:');
    expect(output).not.toContain('NeverPrintThisSecret');
    expect(seen.length).toBeGreaterThan(0);
  }, 30_000);

  it('the restore check’s download exits 1 too', async () => {
    const { code, output } = await run('download.ts', path.join(dir, 'out.dump.gpg'));
    expect(code).toBe(1);
    expect(output).toContain('Backup download failed:');
    expect(output).not.toContain('NeverPrintThisSecret');
  }, 30_000);
});
