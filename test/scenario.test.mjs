import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installVscodeMock } from './vscode-mock.mjs';

const { vscode } = installVscodeMock();
const require = Module.createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SAMPLE = `<!DOCTYPE html>
<html>
<body>
    <div class="box">
        <div class="title">Banner unavailable</div>
    </div>
</body>
</html>
`;

const UPDATED = `<!DOCTYPE html>
<html>
<body>
    <div class="box">
        <div class="title">Banner unavailable</div>
        <div class="hint">Проверьте домен</div>
    </div>
</body>
</html>
`;

/**
 * @param {string} filePath
 * @param {string} text
 */
function fakeEditorFor(filePath, text) {
  const lines = text.split('\n');
  const calls = [];
  return {
    calls,
    document: {
      uri: { fsPath: filePath, toString: () => `file://${filePath}` },
      isDirty: false,
      languageId: 'blade',
      lineCount: lines.length,
      getText: () => text,
      lineAt: (line) => ({ text: lines[line] ?? '' }),
    },
    setDecorations(type, decorations) {
      calls.push({ type, decorations });
    },
  };
}

test('сценарий: файл изменился на диске — подсветка попала в редактор', async () => {
  const extension = require('../extension/src/extension.js');
  const context = { subscriptions: [], secrets: { get: async () => undefined, store: async () => undefined } };
  extension.activate(context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const controller = context.subscriptions[0];
  const dir = path.join(root, '.tmp-scenario');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'invalid-domain.blade.php');
  await fs.writeFile(file, SAMPLE, 'utf8');

  // Расширение запомнило файл до правки.
  controller.tracker.setBaseline(file, SAMPLE);

  // «Агент» правит файл на диске.
  await fs.writeFile(file, UPDATED, 'utf8');

  // VS Code уже перечитал файл и показывает его в редакторе.
  const editor = fakeEditorFor(file, UPDATED);
  vscode.window.visibleTextEditors.push(editor);

  await controller.onDiskChanged({
    scheme: 'file',
    fsPath: file,
    toString: () => 'file:///invalid-domain.blade.php',
  });

  const change = controller.tracker.get(file);
  assert.ok(change, 'изменение не зафиксировано');
  assert.equal(change.diff.added, 1);
  assert.equal(change.diff.removed, 0);
  assert.equal(change.firstLine, 5, 'подсветка должна попасть на добавленную строку');

  const addedCall = editor.calls.find((call) => call.type.options.isWholeLine === true);
  assert.ok(addedCall, 'подсветка не применена к редактору');
  assert.deepEqual(addedCall.decorations.map((item) => item.range.start.line), [5]);

  // «Вернуть» восстанавливает исходное содержимое в снимке.
  const restored = controller.tracker.revert(file);
  assert.equal(restored, SAMPLE);
  assert.equal(controller.tracker.size, 0);

  vscode.window.visibleTextEditors.length = 0;
  await fs.rm(dir, { recursive: true, force: true });
  extension.deactivate();
});

test('сценарий: изменения, сделанные git, не подсвечиваются', async () => {
  const extension = require('../extension/src/extension.js');
  const context = { subscriptions: [] };
  extension.activate(context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const controller = context.subscriptions[0];
  const dir = path.join(root, '.tmp-scenario-git');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'Case.php');
  await fs.writeFile(file, SAMPLE, 'utf8');

  controller.tracker.setBaseline(file, SAMPLE);

  // «git pull»: перед правкой файлов git трогает свой каталог.
  controller.gitUntil = Date.now() + 10_000;
  await fs.writeFile(file, UPDATED, 'utf8');
  await controller.onDiskChanged({
    scheme: 'file',
    fsPath: file,
    toString: () => 'file:///Case.php',
  });

  assert.equal(controller.tracker.size, 0, 'правку git подсвечивать нельзя');
  assert.equal(controller.tracker.baseline(file), UPDATED, 'снимок должен обновиться');

  // А вот следующая правка (уже от модели) должна подсветиться.
  await fs.writeFile(file, `${UPDATED}\n<!-- model -->\n`, 'utf8');
  controller.gitUntil = 0;
  await controller.onDiskChanged({
    scheme: 'file',
    fsPath: file,
    toString: () => 'file:///Case.php',
  });

  assert.equal(controller.tracker.size, 1, 'правка модели должна подсветиться');
  assert.ok(controller.tracker.get(file).diff.added >= 1);

  await fs.rm(dir, { recursive: true, force: true });
  extension.deactivate();
});
