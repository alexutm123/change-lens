import test from 'node:test';
import assert from 'node:assert/strict';

import { ChangeTracker } from '../extension/src/tracker.js';

const PATH = 'D:\\project\\app\\Http\\Controller.php';

test('трекер: первое изменение после снимка даёт дифф', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb\nc');

  const change = tracker.noteDisk(PATH, 'a\nB\nc', 'file:///p');
  assert.ok(change);
  assert.equal(change.before, 'a\nb\nc');
  assert.equal(change.after, 'a\nB\nc');
  assert.equal(change.diff.added, 1);
  assert.equal(change.diff.removed, 1);
  assert.equal(change.kind, 'agent');
  assert.equal(tracker.size, 1);
});

test('трекер: повторная правка накапливается от исходного состояния', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb\nc');
  tracker.noteDisk(PATH, 'a\nB\nc', 'file:///p');

  const second = tracker.noteDisk(PATH, 'a\nB\nC', 'file:///p');
  assert.ok(second);
  assert.equal(second.before, 'a\nb\nc', 'сравнивать нужно с исходной версией');
  assert.equal(second.after, 'a\nB\nC');
  assert.equal(second.diff.added, 2);
  assert.equal(second.diff.removed, 2);
  assert.equal(tracker.size, 1);
});

test('трекер: файл вернули к исходному — изменение исчезает', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb\nc');
  tracker.noteDisk(PATH, 'a\nB\nc', 'file:///p');

  const change = tracker.noteDisk(PATH, 'a\nb\nc', 'file:///p');
  assert.equal(change, null);
  assert.equal(tracker.size, 0);
});

test('трекер: без снимка изменение не выдумывается', () => {
  const tracker = new ChangeTracker();
  const change = tracker.noteDisk(PATH, 'a\nb', 'file:///p');
  assert.equal(change, null);
  assert.equal(tracker.get(PATH), undefined);
  assert.equal(tracker.baseline(PATH), 'a\nb', 'база должна запомниться для следующего раза');
});

test('трекер: сохранение не закрывает разбор изменения', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb');
  tracker.noteDisk(PATH, 'a\nB', 'file:///p');
  assert.equal(tracker.size, 1);

  tracker.noteSavedLocally(PATH, 'a\nB');
  assert.equal(tracker.size, 1, 'изменение остаётся до Accept или Revert');
  assert.equal(tracker.baseline(PATH), 'a\nB');
});

test('трекер: живая правка пересчитывает дифф от исходной версии', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb');
  tracker.noteDisk(PATH, 'a\nB', 'file:///p');

  const change = tracker.noteLiveEdit(PATH, 'a\nB\nc');
  assert.ok(change);
  assert.equal(change.after, 'a\nB\nc');
  assert.equal(change.diff.added, 2);
  assert.equal(tracker.size, 1);
});

test('трекер: откат возвращает исходный текст и базу', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb');
  tracker.noteDisk(PATH, 'a\nB', 'file:///p');

  const restored = tracker.revert(PATH);
  assert.equal(restored, 'a\nb');
  assert.equal(tracker.size, 0);
  assert.equal(tracker.baseline(PATH), 'a\nb');
});

test('трекер: принятие просто забывает изменение', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\nb');
  tracker.noteDisk(PATH, 'a\nB', 'file:///p');

  tracker.accept(PATH);
  assert.equal(tracker.size, 0);
  assert.equal(tracker.baseline(PATH), 'a\nB', 'новая версия остаётся базой');
});

test('трекер: правка через ИИ помечается отдельно', () => {
  const tracker = new ChangeTracker();
  const change = tracker.noteEdit({
    path: PATH,
    uri: 'file:///p',
    before: 'a\nb',
    after: 'a\nB1\nB2',
    instruction: 'добавь строку',
  });

  assert.equal(change.kind, 'edit');
  assert.equal(change.instruction, 'добавь строку');
  assert.equal(tracker.size, 1);
  assert.equal(tracker.list()[0].id, change.id);
});

test('трекер: список отсортирован от новых к старым', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline('a', 'x');
  tracker.setBaseline('b', 'y');
  const first = tracker.noteDisk('a', 'x1', 'file:///a');
  const second = tracker.noteDisk('b', 'y1', 'file:///b');
  second.at = first.at + 1000;

  const [newest] = tracker.list();
  assert.equal(newest.path, 'b');
});

test('дифф изменения: CRLF и LF считаются одинаковыми', () => {
  const tracker = new ChangeTracker();
  tracker.setBaseline(PATH, 'a\r\nb\r\n');
  const change = tracker.noteDisk(PATH, 'a\nb\n', 'file:///p');
  assert.equal(change, null);
});
