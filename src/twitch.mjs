import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://api.twitch.tv/helix';
const AUTH = 'https://id.twitch.tv/oauth2';
const SCOPE = 'user:read:chat user:write:chat';

export class TwitchConnection {
  constructor({ privateDir, onStatus = () => {}, onOnline = () => {}, onOffline = () => {}, onChat = () => {}, onCommand = () => {}, fetchImpl = fetch, WebSocketImpl = WebSocket }) {
    Object.assign(this, { privateDir, onStatus, onOnline, onOffline, onChat, onCommand, fetchImpl, WebSocketImpl });
    this.config = null; this.token = null; this.socket = null; this.user = null; this.broadcaster = null;
    this.status = 'Not connected'; this.seen = new Set(); this.sentTexts = new Map(); this.reconnectTimer = null; this.stopped = false; this.ready = false; this.lastCommand = 0;
  }
  async load() {
    try { this.config = JSON.parse(await readFile(join(this.privateDir, 'twitch-config.json'), 'utf8')); } catch {}
    try { this.token = JSON.parse(await readFile(join(this.privateDir, 'twitch-token.json'), 'utf8')); } catch {}
    if (this.config && this.token) await this.start().catch(error => this.setStatus(`Twitch connection needs attention: ${error.message}`));
  }
  async configure(clientId, channel) {
    if (!/^[a-z0-9]{8,50}$/i.test(clientId) || !/^[a-z0-9_]{3,25}$/i.test(channel)) throw new Error('Enter a Twitch Client ID and channel name.');
    this.stop(); this.stopped = false; this.config = { clientId, channel: channel.toLowerCase() }; this.token = null;
    await mkdir(this.privateDir, { recursive: true });
    await writeFile(join(this.privateDir, 'twitch-config.json'), JSON.stringify(this.config), { mode: 0o600 });
    await rm(join(this.privateDir, 'twitch-token.json'), { force: true });
    this.setStatus('Ready to connect');
  }
  setStatus(message) { this.status = message; this.onStatus(message); }
  async request(url, options = {}) {
    const response = await this.fetchImpl(url, options);
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(`Twitch ${response.status}: ${String(body.message || body.error || 'request failed').slice(0, 160)}`);
    return body;
  }
  async beginDeviceLogin() {
    if (!this.config) throw new Error('Save the Twitch app details first.');
    const body = new URLSearchParams({ client_id: this.config.clientId, scopes: SCOPE });
    const data = await this.request(`${AUTH}/device`, { method: 'POST', body });
    this.setStatus('Waiting for Twitch approval');
    this.pollDevice(data).catch(error => this.setStatus(`Twitch sign-in failed: ${error.message}`));
    return { userCode: data.user_code, verificationUri: data.verification_uri, expiresIn: data.expires_in };
  }
  async pollDevice(device) {
    const deadline = Date.now() + device.expires_in * 1000;
    let interval = Math.max(5, device.interval || 5) * 1000;
    while (Date.now() < deadline && !this.stopped) {
      await new Promise(resolve => setTimeout(resolve, interval));
      const response = await this.fetchImpl(`${AUTH}/token`, { method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, device_code: device.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) });
      const data = await response.json();
      if (response.ok) { await this.saveToken(data); await this.start(); return; }
      if (data.message === 'slow_down') { interval += 5000; continue; }
      if (data.message === 'authorization_pending') continue;
      throw new Error(data.message || 'Authorization was not completed.');
    }
    throw new Error('Authorization expired. Try connecting again.');
  }
  async saveToken(data) {
    this.token = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
    await mkdir(this.privateDir, { recursive: true });
    await writeFile(join(this.privateDir, 'twitch-token.json'), JSON.stringify(this.token), { mode: 0o600 });
  }
  async accessToken() {
    if (!this.token) throw new Error('Connect Twitch first.');
    if (this.token.expires_at - Date.now() > 5 * 60_000) return this.token.access_token;
    const data = await this.request(`${AUTH}/token`, { method: 'POST', body: new URLSearchParams({ client_id: this.config.clientId, refresh_token: this.token.refresh_token, grant_type: 'refresh_token' }) });
    await this.saveToken(data);
    return this.token.access_token;
  }
  async helix(path, options = {}) {
    const token = await this.accessToken();
    return this.request(`${API}${path}`, { ...options, headers: { 'Client-Id': this.config.clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
  }
  async start() {
    this.stopped = false;
    const token = await this.accessToken();
    const validation = await this.request(`${AUTH}/validate`, { headers: { Authorization: `OAuth ${token}` } });
    this.user = { id: validation.user_id, login: validation.login };
    const users = await this.helix(`/users?login=${encodeURIComponent(this.config.channel)}`);
    this.broadcaster = users.data?.[0];
    if (!this.broadcaster) throw new Error('Twitch channel was not found.');
    this.openSocket('wss://eventsub.wss.twitch.tv/ws', false);
  }
  openSocket(url, transferred) {
    const socket = new this.WebSocketImpl(url);
    const previous = this.socket;
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      this.handleMessage(message, socket, transferred).catch(error => {
        this.setStatus(`Twitch event error: ${error.message}`);
        if (message.metadata?.message_type === 'session_welcome') socket.close();
      });
    });
    socket.addEventListener('close', () => {
      if (this.stopped || socket !== this.socket) return;
      this.ready = false; this.setStatus('Twitch disconnected; reconnecting');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.start().catch(error => this.setStatus(`Twitch reconnect failed: ${error.message}`)), 3000);
    });
    socket.addEventListener('error', () => this.setStatus('Twitch socket error'));
    if (!transferred) this.socket = socket;
    else this.pendingSocket = { socket, previous };
  }
  async subscribe(type, sessionId) {
    const condition = type === 'channel.chat.message' ? { broadcaster_user_id: this.broadcaster.id, user_id: this.user.id } : { broadcaster_user_id: this.broadcaster.id };
    await this.helix('/eventsub/subscriptions', { method: 'POST', body: JSON.stringify({ type, version: '1', condition, transport: { method: 'websocket', session_id: sessionId } }) });
  }
  async handleMessage(message, socket, transferred = false) {
    const type = message.metadata?.message_type;
    if (type === 'session_welcome') {
      if (transferred) { this.socket = socket; this.pendingSocket?.previous?.close(); this.pendingSocket = null; this.ready = true; this.setStatus('Connected to Twitch'); return; }
      const sessionId = message.payload?.session?.id;
      await this.subscribe('channel.chat.message', sessionId);
      this.ready = true;
      this.setStatus('Connected to Twitch chat');
      await Promise.all([this.subscribe('stream.online', sessionId), this.subscribe('stream.offline', sessionId)]);
      const streams = await this.helix(`/streams?user_id=${this.broadcaster.id}`);
      if (streams.data?.length) this.onOnline(streams.data[0]);
      return;
    }
    if (type === 'session_reconnect') { this.openSocket(message.payload.session.reconnect_url, true); return; }
    if (type === 'revocation') { this.setStatus('Twitch permission revoked; reconnect the app'); return; }
    if (type !== 'notification') return;
    const messageId = message.metadata.message_id;
    if (this.seen.has(messageId)) return;
    this.seen.add(messageId);
    if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value);
    const event = message.payload.event;
    switch (message.payload.subscription.type) {
      case 'stream.online': this.onOnline(event); break;
      case 'stream.offline': this.onOffline(event); break;
      case 'channel.chat.message': {
        const text = event.message?.text || '';
        if (/^!recap(?:\s|$)/i.test(text)) {
          const isBroadcaster = event.chatter_user_id === this.broadcaster.id;
          const isMod = event.badges?.some(b => b.set_id === 'moderator' || b.set_id === 'broadcaster');
          if ((isBroadcaster || isMod) && Date.now() - this.lastCommand >= 5 * 60_000) { this.lastCommand = Date.now(); this.onCommand(event); }
          return;
        }
        if (event.chatter_user_id === this.user.id && Date.now() - (this.sentTexts.get(text) || 0) < 30_000) {
          this.sentTexts.delete(text);
          return;
        }
        this.onChat({ id: event.message_id, user: event.chatter_user_login, text: text.slice(0, 500), at: new Date().toISOString() });
      }
    }
  }
  async sendChat(message) {
    if (!this.user || !this.broadcaster) throw new Error('Twitch is not connected.');
    const text = message.slice(0, 500);
    this.sentTexts.set(text, Date.now());
    try { return await this.helix('/chat/messages', { method: 'POST', body: JSON.stringify({ broadcaster_id: this.broadcaster.id, sender_id: this.user.id, message: text }) }); }
    catch (error) { this.sentTexts.delete(text); throw error; }
  }
  stop() { this.stopped = true; this.ready = false; clearTimeout(this.reconnectTimer); this.socket?.close(); this.socket = null; }
  publicState() { return { status: this.status, configured: Boolean(this.config), connected: this.ready, channel: this.config?.channel || null, bot: this.user?.login || null }; }
}
