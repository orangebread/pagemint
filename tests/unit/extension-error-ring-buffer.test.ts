import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ErrorRingBuffer,
  errorRing,
  type ErrorRingEntry
} from '../../apps/extension/src/lib/error-ring-buffer.ts';

function makeEntry(overrides: Partial<ErrorRingEntry> = {}): ErrorRingEntry {
  return {
    ts: 1_700_000_000_000,
    kind: 'test',
    message: 'something broke',
    stackHead: 'at foo (bar.ts:1:1)',
    ...overrides
  };
}

test('ErrorRingBuffer FIFO drops oldest after 5 entries', () => {
  const ring = new ErrorRingBuffer();
  for (let i = 0; i < 7; i += 1) {
    ring.push(makeEntry({ ts: i, message: `msg-${i}` }));
  }
  const snap = ring.snapshot();
  assert.equal(snap.length, 5);
  // Entries 0 and 1 should have been dropped; 2..6 remain in insertion order.
  assert.deepEqual(
    snap.map((e) => e.message),
    ['msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6']
  );
});

test('ErrorRingBuffer truncates message to 256 chars', () => {
  const ring = new ErrorRingBuffer();
  const longMessage = 'a'.repeat(1000);
  ring.push(makeEntry({ message: longMessage, stackHead: undefined }));
  const stored = ring.snapshot()[0];
  assert.ok(stored);
  assert.equal(stored.message.length, 256);
  assert.equal(stored.message, 'a'.repeat(256));
});

test('ErrorRingBuffer truncates stackHead to 512 chars', () => {
  const ring = new ErrorRingBuffer();
  const longStack = 'b'.repeat(2000);
  ring.push(makeEntry({ message: 'short', stackHead: longStack }));
  const stored = ring.snapshot()[0];
  assert.ok(stored);
  assert.equal(stored.stackHead?.length, 512);
  assert.equal(stored.stackHead, 'b'.repeat(512));
});

test('ErrorRingBuffer truncates kind to 64 chars', () => {
  const ring = new ErrorRingBuffer();
  const longKind = 'k'.repeat(200);
  ring.push(makeEntry({ kind: longKind, stackHead: undefined }));
  const stored = ring.snapshot()[0];
  assert.ok(stored);
  assert.equal(stored.kind.length, 64);
  assert.equal(stored.kind, 'k'.repeat(64));
});

test('ErrorRingBuffer enforces 2500-byte total cap, dropping oldest', () => {
  const ring = new ErrorRingBuffer();
  // 5 entries, each at the max sizes (256 + 512 = 768 chars). 5 * 768 = 3840 > 2500.
  for (let i = 0; i < 5; i += 1) {
    ring.push(
      makeEntry({
        ts: i,
        message: 'm'.repeat(256),
        stackHead: 's'.repeat(512)
      })
    );
  }
  const total = ring
    .snapshot()
    .reduce((acc, e) => acc + e.message.length + (e.stackHead?.length ?? 0), 0);
  assert.ok(total <= 2500, `total bytes ${total} should be <= 2500`);
  assert.ok(ring.snapshot().length <= 5);

  // Pushing more should keep cap respected and drop oldest.
  ring.push(
    makeEntry({
      ts: 100,
      message: 'm'.repeat(256),
      stackHead: 's'.repeat(512)
    })
  );
  const total2 = ring
    .snapshot()
    .reduce((acc, e) => acc + e.message.length + (e.stackHead?.length ?? 0), 0);
  assert.ok(total2 <= 2500, `total bytes ${total2} should still be <= 2500`);
  // Newest entry must survive.
  const lastEntry = ring.snapshot().at(-1);
  assert.ok(lastEntry);
  assert.equal(lastEntry.ts, 100);
});

test('ErrorRingBuffer.clear() empties the buffer', () => {
  const ring = new ErrorRingBuffer();
  ring.push(makeEntry());
  ring.push(makeEntry());
  assert.equal(ring.snapshot().length, 2);
  ring.clear();
  assert.equal(ring.snapshot().length, 0);
});

test('ErrorRingBuffer.snapshot() returns a copy', () => {
  const ring = new ErrorRingBuffer();
  ring.push(makeEntry({ message: 'first' }));
  const snap = ring.snapshot();
  snap.push(makeEntry({ message: 'mutated' }));
  snap.length = 0;
  // Internal state must be untouched by external mutation of the returned array.
  assert.equal(ring.snapshot().length, 1);
  assert.equal(ring.snapshot()[0]?.message, 'first');
});

test('errorRing singleton is the same instance across imports', async () => {
  const mod = await import('../../apps/extension/src/lib/error-ring-buffer.ts');
  assert.equal(mod.errorRing, errorRing);
  // And it is an instance of the exported class.
  assert.ok(errorRing instanceof ErrorRingBuffer);
});
