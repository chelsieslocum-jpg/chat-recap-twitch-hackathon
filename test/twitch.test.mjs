import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchConnection } from '../src/twitch.mjs';

test('Twitch event handler deduplicates chat and limits !recap to moderators', async () => {
  const chat = [], commands = [];
  const client = new TwitchConnection({ privateDir: '.', onChat: x => chat.push(x), onCommand: x => commands.push(x), fetchImpl: async () => { throw new Error('unexpected network'); }, WebSocketImpl: class {} });
  client.user = { id: 'bot' }; client.broadcaster = { id: 'owner' };
  const notification = (id, text, badges = []) => ({ metadata: { message_type: 'notification', message_id: id }, payload: { subscription: { type: 'channel.chat.message' }, event: { chatter_user_id: 'viewer', chatter_user_login: 'viewer', message_id: id, message: { text }, badges } } });
  await client.handleMessage(notification('1', 'hello'));
  await client.handleMessage(notification('1', 'hello'));
  await client.handleMessage(notification('2', '!recap'));
  await client.handleMessage(notification('3', '!recap', [{ set_id: 'moderator' }]));
  await client.handleMessage(notification('4', '!recap', [{ set_id: 'moderator' }]));
  assert.equal(chat.length, 1);
  assert.equal(commands.length, 1);
});

test('broadcaster chat is captured while the app skips its own reply', async () => {
  const chat = [];
  const client = new TwitchConnection({ privateDir: '.', onChat: x => chat.push(x), fetchImpl: async () => { throw new Error('unexpected network'); }, WebSocketImpl: class {} });
  client.user = { id: 'owner' }; client.broadcaster = { id: 'owner' };
  const event = (id, text) => ({ metadata: { message_type: 'notification', message_id: id }, payload: { subscription: { type: 'channel.chat.message' }, event: { chatter_user_id: 'owner', chatter_user_login: 'owner', message_id: id, message: { text } } } });
  client.sentTexts.set('Chat recap: keyboard', Date.now());
  await client.handleMessage(event('1', 'Which keyboard?'));
  await client.handleMessage(event('2', 'Chat recap: keyboard'));
  assert.equal(chat.length, 1);
  assert.equal(chat[0].text, 'Which keyboard?');
});
