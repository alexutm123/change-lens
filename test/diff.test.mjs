import test from 'node:test';
import assert from 'node:assert/strict';

import { diffLines } from '../extension/src/diff.js';

test('дифф: одинаковый текст не даёт изменений', () => {
  const text = 'a\nb\nc';
  const result = diffLines(text, text);
  assert.equal(result.changed, false);
  assert.equal(result.hunks.length, 0);
  assert.equal(result.added, 0);
  assert.equal(result.removed, 0);
});

test('дифф: добавление строки в середину', () => {
  const before = 'a\nb\nc';
  const after = 'a\nb\nNEW\nc';
  const { hunks, added, removed } = diffLines(before, after);
  assert.equal(added, 1);
  assert.equal(removed, 0);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].newStart, 2);
  assert.deepEqual(hunks[0].added, ['NEW']);
});

test('дифф: удаление строки', () => {
  const before = 'a\nb\nc\nd';
  const after = 'a\nc\nd';
  const { hunks, added, removed } = diffLines(before, after);
  assert.equal(added, 0);
  assert.equal(removed, 1);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].removedCount, 1);
  assert.equal(hunks[0].newStart, 1);
  assert.deepEqual(hunks[0].removed, ['b']);
});

test('дифф: замена блока', () => {
  const before = 'function a() {\n  return 1;\n}\n\nexport const x = 1;';
  const after = 'function a() {\n  return 2;\n}\n\nexport const x = 1;';
  const { hunks, added, removed } = diffLines(before, after);
  assert.equal(hunks.length, 1);
  assert.equal(added, 1);
  assert.equal(removed, 1);
  assert.equal(hunks[0].newStart, 1);
  assert.deepEqual(hunks[0].removed, ['  return 1;']);
  assert.deepEqual(hunks[0].added, ['  return 2;']);
});

test('дифф: два независимых блока', () => {
  const before = 'a\nb\nc\nd\ne\nf';
  const after = 'a\nB\nc\nd\ne\nF';
  const { hunks } = diffLines(before, after);
  assert.equal(hunks.length, 2);
  assert.equal(hunks[0].newStart, 1);
  assert.equal(hunks[1].newStart, 5);
});

test('дифф: CRLF нормализуется', () => {
  const result = diffLines('a\r\nb\r\n', 'a\nb\n');
  assert.equal(result.changed, false);
});

test('дифф: пустой новый текст = только удаления', () => {
  const result = diffLines('a\nb', '');
  assert.equal(result.removed, 2);
  assert.equal(result.added, 0);
  assert.equal(result.hunks.length, 1);
});

test('дифф: изменение с самого начала файла', () => {
  const result = diffLines('a\nb\nc', 'x\na\nb\nc');
  assert.equal(result.hunks.length, 1);
  assert.equal(result.hunks[0].newStart, 0);
});
