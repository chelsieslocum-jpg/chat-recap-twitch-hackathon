import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChat, verifyGroups, makeCards, groupLocally } from '../src/recap.mjs';

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
test('local grouping makes source-linked topics without a model', () => {
  const chat = parseChat('demo_a: Which keyboard is that?\ndemo_b: What keyboard model do you use?\ndemo_c: Can we do another puzzle?\ndemo_d: More puzzles next time please');
  const cards = makeCards(groupLocally(chat), chat);
  assert.equal(cards.length, 2);
  assert.equal(cards.find(card => card.topic.startsWith('Keyboard')).viewers, 2);
  assert.equal(cards.find(card => card.topic.startsWith('Puzzle')).viewers, 2);
  for (const card of cards) assert.ok(card.sources.some(source => source.text.includes(card.quote)));
});
test('local recap surfaces one-off questions without inventing topics', () => {
  const chat = parseChat('demo_a: Can you make a tutorial?\ndemo_b: What are your next builds?\ndemo_c: Thanks for the stream');
  const cards = makeCards(groupLocally(chat), chat);
  assert.equal(cards.length, 3);
  assert.ok(cards.some(card => card.topic === 'Can you make a tutorial'));
  assert.ok(cards.some(card => card.topic === 'What are your next builds'));
  assert.ok(cards.some(card => card.topic === 'Other chat moments'));
});
