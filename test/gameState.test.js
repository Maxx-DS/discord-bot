const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldNotifyFinalRelease, groupGames } = require('../src/gameState');

test('does not notify when a game is already marked as released', () => {
  assert.equal(
    shouldNotifyFinalRelease({ released: true, earlyAccess: false }, false, true),
    false
  );
});

test('notifies when an early access game becomes a final release', () => {
  assert.equal(
    shouldNotifyFinalRelease({ released: true, earlyAccess: true }, false, true),
    true
  );
});

test('does not notify for a pending game', () => {
  assert.equal(
    shouldNotifyFinalRelease({ released: false, earlyAccess: true }, true, false),
    false
  );
});

test('keeps unreleased early access games only in the pending section', () => {
  const game = { released: false, earlyAccess: true };
  const sections = groupGames([game]);

  assert.deepEqual(sections.earlyAccessGames, []);
  assert.deepEqual(sections.pendingGames, [game]);
});
