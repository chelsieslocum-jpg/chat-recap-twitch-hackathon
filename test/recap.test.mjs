import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChat, verifyGroups, makeCards } from '../src/recap.mjs';

const messages = parseChat('demo_maple: Which keyboard is that?\ndemo_fern: Is it a mechanical keyboard?\ndemo_maple: I like the sound.');
test('paste parser accepts viewer: message lines', () => {
  assert.equal(messages.length, 3);
  assert.equal(messages[0].user, 'demo_maple');
  assert.throws(() => parseChat('no viewer separator'));
});
test('source gate rejects invented quote and invalid indexes', () => {
  assert.throws(() => verifyGroups([{ topic: 'keyboard', quote: 'invented', ids: [0] }], messages));
  assert.throws(() => verifyGroups([{ topic: 'keyboard', quote: 'Which keyboard', ids: [9] }], messages));
  assert.throws(() => verifyGroups([{ topic: 'keyboard', quote: 'Which keyboard', ids: [0, 0] }], messages));
});
test('cards count distinct viewers and retain exact sources', () => {
  const [card] = makeCards([{ topic: 'keyboard', quote: 'Which keyboard', ids: [0, 1, 2] }], messages);
  assert.equal(card.viewers, 2);
  assert.equal(card.sources.length, 3);
  assert.equal(card.quoteUser, 'demo_maple');
});
