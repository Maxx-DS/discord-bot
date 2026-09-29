const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldNotifyFinalRelease } = require('../src/gameState');

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
