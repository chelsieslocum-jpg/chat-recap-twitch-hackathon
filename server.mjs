import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseChat, groupWithCodex, groupLocally, makeCards } from './src/recap.mjs';
import { TwitchConnection } from './src/twitch.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PRIVATE = process.env.CHAT_RECAP_DATA_DIR || join(ROOT, '.private');
const PORT = Number(process.env.PORT || 8820);
await mkdir(PRIVATE, { recursive: true });
const db = new DatabaseSync(join(PRIVATE, 'recaps.sqlite3'));
db.exec('CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, channel TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, messages TEXT NOT NULL, cards TEXT NOT NULL, error TEXT)');
db.exec("UPDATE sessions SET status='interrupted', error='Capture stopped when the app closed.' WHERE status='capturing'");
const insert = db.prepare('INSERT INTO sessions (kind,channel,status,created_at,messages,cards,error) VALUES (?,?,?,?,?,?,?)');
const update = db.prepare('UPDATE sessions SET status=?,messages=?,cards=?,error=? WHERE id=?');
const get = db.prepare('SELECT * FROM sessions WHERE id=?');
const list = db.prepare('SELECT id,kind,channel,status,created_at,json_array_length(messages) AS message_count,json_array_length(cards) AS card_count,error FROM sessions ORDER BY id DESC LIMIT 30');
let activeId = null;
let processing = false;
let processingId = null;
let processingTask = null;
let phase = 'idle';
let phaseError = null;

function row(id) {
  const item = get.get(id);
  return item && { id: item.id, kind: item.kind, channel: item.channel, status: item.status, createdAt: item.created_at, messages: JSON.parse(item.messages), cards: JSON.parse(item.cards), error: item.error };
}
function create(kind, channel, messages = [], status = 'ready') {
  const result = insert.run(kind, channel, status, new Date().toISOString(), JSON.stringify(messages), '[]', null);
  return Number(result.lastInsertRowid);
}
function save(item) { update.run(item.status, JSON.stringify(item.messages), JSON.stringify(item.cards), item.error, item.id); }
function onOnline() {
  if (activeId) return;
  activeId = create('live', twitch.config.channel, [], 'capturing');
  phase = 'capturing'; phaseError = null;
}
function onChat(message) {
  if (!activeId) return;
  const item = row(activeId);
  if (item.messages.some(m => m.id === message.id)) return;
  item.messages.push(message);
  if (item.messages.length > 3000) item.messages.shift();
  save(item);
}
async function buildRecap(id) {
  if (processingTask) {
    if (processingId === id) return processingTask;
    await processingTask.catch(() => {});
  }
  const item = row(id);
  if (!item) throw new Error('Session not found.');
  if (!item.messages.length) throw new Error('No chat messages captured yet.');
  processing = true; processingId = id;
  processingTask = (async () => {
    phase = 'grouping'; phaseError = null;
    item.status = 'building'; item.error = null; save(item);
    try {
      const sample = item.messages.slice(-300);
      let groups;
      let method = 'local';
      if (process.env.CHAT_RECAP_ENGINE === 'codex') {
        try {
          groups = await groupWithCodex(sample, { bin: process.env.CODEX_BIN || 'codex', timeoutMs: Number(process.env.CODEX_TIMEOUT_SECONDS || 120) * 1000 });
          method = 'codex';
        } catch {
          groups = groupLocally(sample);
        }
      } else {
        groups = groupLocally(sample);
      }
      phase = 'verifying';
      item.cards = makeCards(groups, sample);
      item.status = method === 'codex' ? 'ready-codex' : 'ready-local'; item.error = null; save(item);
      phase = 'ready';
      return item;
    } catch (error) {
      item.status = 'failed'; item.error = error.message; save(item);
      phase = 'failed'; phaseError = error.message;
      throw error;
    }
  })();
  try { return await processingTask; }
  finally { processing = false; processingId = null; processingTask = null; }
}
function onOffline() {
  if (!activeId) return;
  const id = activeId; activeId = null;
  const item = row(id);
  if (!item.messages.length) { item.status = 'empty'; save(item); phase = 'idle'; return; }
  buildRecap(id).catch(() => {});
}
async function onCommand() {
  const id = activeId || list.all().find(s => s.card_count)?.id;
  if (!id) { await twitch.sendChat('No chat recap yet. Keep chatting and try again soon.'); return; }
  try {
    const item = activeId ? await buildRecap(id) : row(id);
    const topics = item.cards.slice(0, 3).map(c => `${c.topic} (${c.viewers} viewers)`).join(' · ');
    await twitch.sendChat(`Chat recap: ${topics}`);
  } catch { await twitch.sendChat('Recap is not ready. Please try again in a few minutes.').catch(() => {}); }
}
const twitch = new TwitchConnection({ privateDir: PRIVATE, onStatus: () => {}, onOnline, onOffline, onChat, onCommand });
await twitch.load();

function json(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(body);
}
async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Send JSON.');
  let data = '';
  for await (const chunk of request) { data += chunk; if (data.length > 200_000) throw new Error('Request is too large.'); }
  return JSON.parse(data || '{}');
}
async function page(response, name, type) {
  const content = await readFile(join(ROOT, 'public', name));
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); response.end(content);
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const method = request.method;
    if (method === 'GET' && url.pathname === '/') return await page(response, 'index.html', 'text/html; charset=utf-8');
    if (method === 'GET' && url.pathname === '/app.js') return await page(response, 'app.js', 'text/javascript; charset=utf-8');
    if (method === 'GET' && url.pathname === '/style.css') return await page(response, 'style.css', 'text/css; charset=utf-8');
    if (method === 'GET' && url.pathname === '/overlay') return await page(response, 'overlay.html', 'text/html; charset=utf-8');
    if (method === 'GET' && url.pathname === '/api/state') return json(response, 200, { twitch: twitch.publicState(), active: activeId ? row(activeId) : null, phase, phaseError, processing });
    if (method === 'GET' && url.pathname === '/api/sessions') return json(response, 200, list.all());
    if (method === 'GET' && /^\/api\/sessions\/\d+$/.test(url.pathname)) { const item = row(Number(url.pathname.split('/').pop())); return json(response, item ? 200 : 404, item || { error: 'Session not found.' }); }
    if (method === 'GET' && url.pathname === '/api/overlay') { const item = activeId ? row(activeId) : null; const latestId = list.all().find(s => s.card_count)?.id; const latest = item?.cards.length ? item : latestId ? row(latestId) : null; return json(response, 200, { channel: twitch.config?.channel || null, live: Boolean(activeId), messageCount: item?.messages.length || 0, cards: latest?.cards || [] }); }
    if (method === 'POST' && url.pathname === '/api/twitch/config') { const input = await body(request); await twitch.configure(input.clientId, input.channel); return json(response, 200, twitch.publicState()); }
    if (method === 'POST' && url.pathname === '/api/twitch/connect') { await body(request); return json(response, 200, await twitch.beginDeviceLogin()); }
    if (method === 'POST' && url.pathname === '/api/paste') { const input = await body(request); const messages = parseChat(input.chat); const id = create('paste', null, messages); return json(response, 200, row(id)); }
    if (method === 'POST' && /^\/api\/sessions\/\d+\/recap$/.test(url.pathname)) { await body(request); const id = Number(url.pathname.split('/')[3]); return json(response, 200, await buildRecap(id)); }
    json(response, 404, { error: 'Not found.' });
  } catch (error) { json(response, 400, { error: error.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Chat Recap: http://127.0.0.1:${PORT}`));
