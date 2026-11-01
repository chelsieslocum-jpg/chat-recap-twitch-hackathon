import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local server serves state, overlay, and pasted sessions', async () => {
  const port = 18000 + Math.floor(Math.random() * 20000);
  const dataDir = await mkdtemp(join(tmpdir(), 'chat-recap-test-'));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, PORT: String(port), CHAT_RECAP_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before start.'); })]);
    const base = `http://127.0.0.1:${port}`;
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.active, null);
    const overlay = await (await fetch(`${base}/api/overlay`)).json();
    assert.deepEqual(overlay.cards, []);
    const response = await fetch(`${base}/api/paste`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: 'demo_a: hello chat' }) });
    assert.equal(response.status, 200);
    const item = await response.json();
    assert.equal(item.messages[0].user, 'demo_a');
    const loaded = await (await fetch(`${base}/api/sessions/${item.id}`)).json();
    assert.equal(loaded.messages.length, 1);
  } finally { child.kill(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
