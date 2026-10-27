import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

import { installVscodeMock } from './vscode-mock.mjs';

const { vscode } = installVscodeMock();
const require = Module.createRequire(import.meta.url);

const { Change } = require('../extension/src/change.js');
const { Decorations } = require('../extension/src/render.js');

/** @param {string[]} lines */
function fakeDocument(lines, languageId = 'php') {
  return {
    lineCount: lines.length,
    languageId,
    uri: { fsPath: '/sample.php', toString: () => 'file:///sample.php' },
    lineAt: (line) => ({ text: lines[line] ?? '' }),
  };
}

function fakeEditor(document) {
  const calls = [];
  return {
    document,
    calls,
    setDecorations(type, decorations) {
      calls.push({ type, decorations });
    },
  };
}

test('подсветка: зелёные строки и красный «призрак» удалённого', async () => {
  const change = new Change({
    id: '1',
    path: '/sample.php',
    uri: 'file:///sample.php',
    before: 'x\ny\na\nb\nz',
    after: 'x\ny\na\nB1\nB2\nz',
  });

  const document = fakeDocument(['x', 'y', 'a', 'B1', 'B2', 'z']);
  const editor = fakeEditor(document);

  const decorations = new Decorations();
  await decorations.apply(editor, change);

  const addedCall = editor.calls.find((call) => call.type.options.isWholeLine === true);
  const ghostCall = editor.calls.find((call) => call.type.options.after !== undefined);
  assert.ok(addedCall, 'нет подсветки добавленных строк');
  assert.ok(ghostCall, 'нет «призрака» удалённых строк');

  assert.deepEqual(
    addedCall.decorations.map((item) => item.range.start.line),
    [3, 4],
    'подсвечены не те строки',
  );

  const ghost = ghostCall.decorations[0];
  assert.equal(ghost.range.start.line, 2, 'призрак должен стоять на строке перед блоком');
  assert.equal(ghost.range.end.character, 1, 'призрак должен занимать всю строку');
  assert.match(ghost.renderOptions.after.contentText, /⌫ b/);
  assert.ok(ghost.hoverMessage, 'у призрака нет подсказки с исходным текстом');

  decorations.clear(editor);
  assert.equal(editor.calls.at(-1).decorations.length, 0);
  decorations.dispose();
});

test('подсветка: чистое добавление без удалений не рисует призрак', async () => {
  const change = new Change({
    id: '2',
    path: '/sample.php',
    uri: 'file:///sample.php',
    before: 'a\nb',
    after: 'a\nNEW\nb',
  });
  const editor = fakeEditor(fakeDocument(['a', 'NEW', 'b']));

  const decorations = new Decorations();
  await decorations.apply(editor, change);

  const ghostCall = editor.calls.find((call) => call.type.options.after !== undefined);
  assert.equal(ghostCall.decorations.length, 0);
  const addedCall = editor.calls.find((call) => call.type.options.isWholeLine === true);
  assert.deepEqual(addedCall.decorations.map((item) => item.range.start.line), [1]);
  decorations.dispose();
});

test('подсветка: удаление в начале файла ставит призрак на первую строку', async () => {
  const change = new Change({
    id: '3',
    path: '/sample.php',
    uri: 'file:///sample.php',
    before: 'A\nb',
    after: 'B\nc',
  });
  const editor = fakeEditor(fakeDocument(['B', 'c']));

  const decorations = new Decorations();
  await decorations.apply(editor, change);

  const ghostCall = editor.calls.find((call) => call.type.options.after !== undefined);
  assert.equal(ghostCall.decorations[0].range.start.line, 0);
  const addedCall = editor.calls.find((call) => call.type.options.isWholeLine === true);
  assert.deepEqual(addedCall.decorations.map((item) => item.range.start.line), [0, 1]);
  decorations.dispose();
});

test('подсветка: несколько удалённых строк показываются счётчиком, а не обрубком', async () => {
  const change = new Change({
    id: '5',
    path: '/sample.php',
    uri: 'file:///sample.php',
    before: 'a\nb\nc\nd\ne',
    after: 'a\ne',
  });
  const editor = fakeEditor(fakeDocument(['a', 'e']));

  const decorations = new Decorations();
  await decorations.apply(editor, change);

  const ghostCall = editor.calls.find((call) => call.type.options.after !== undefined);
  const ghost = ghostCall.decorations[0];
  assert.match(ghost.renderOptions.after.contentText, /⌫ b/);
  assert.match(ghost.renderOptions.after.contentText, /\+2 lines/, 'должен быть счётчик удалённых строк');
  decorations.dispose();
});

test('дифф: сравнение текста не зависит от переводов строк', () => {
  const change = new Change({
    id: '4',
    path: '/sample.php',
    uri: 'file:///sample.php',
    before: 'a\r\nb',
    after: 'a\r\nb\r\nc',
  });

  assert.equal(change.matchesText('a\nb\nc'), true);
  assert.equal(change.matchesText('a\nb\nX'), false);
  assert.equal(change.summary, '+1 −0');
});
