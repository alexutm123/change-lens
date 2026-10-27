import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

import { installVscodeMock } from './vscode-mock.mjs';

const { vscode, commands, statusItems } = installVscodeMock();
const require = Module.createRequire(import.meta.url);

const EXPECTED_COMMANDS = [
  'changeLens.acceptChange', 'changeLens.revertChange', 'changeLens.showChangeDiff', 'changeLens.showActions', 
  'changeLens.reviewChanges', 'changeLens.showOutput',
];

test('активация регистрирует команды и поднимает наблюдатель за файлами', async () => {
  const extension = require('../extension/src/extension.js');
  const context = { subscriptions: [] };

  const api = extension.activate(context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  for (const id of EXPECTED_COMMANDS) assert.ok(commands.has(id), `команда ${id} не зарегистрирована`);
  assert.equal(commands.size, EXPECTED_COMMANDS.length);
  assert.equal(typeof api.tracker.setBaseline, 'function');
  assert.equal(api.tracker.size, 0);

  // Команды без активного изменения не должны падать.
  await commands.get('changeLens.acceptChange')();
  await commands.get('changeLens.revertChange')();
  await commands.get('changeLens.showChangeDiff')();
  await commands.get('changeLens.reviewChanges')();

  extension.deactivate();
});

test('статус-бар и CodeLens показывают изменение файла', async () => {
  commands.clear();
  statusItems.length = 0;
  const extension = require('../extension/src/extension.js');
  const context = { subscriptions: [] };
  extension.activate(context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const controller = context.subscriptions[0];
  controller.tracker.setBaseline('/src/a.php', 'a\nb');
  const change = controller.tracker.noteDisk('/src/a.php', 'a\nB1\nB2', 'file:///src/a.php');
  assert.ok(change);
  controller.updateStatus();

  const main = statusItems[0];
  assert.match(main.text, /Change Lens · 1/);

  const document = {
    uri: { fsPath: '/src/a.php', toString: () => 'file:///src/a.php' },
    lineCount: 40,
    lineAt: () => ({ text: '    <div class="box">' }),
  };
  const hints = vscode.__hintProvider.provideInlayHints(document, new vscode.Range(0, 0, 39, 0));
  assert.equal(hints.length, 1, 'должен быть один чип с кнопками');

  const actions = hints[0].label.filter((part) => part.command);
  assert.deepEqual(
    actions.map((part) => part.command.command),
    ['changeLens.acceptChange', 'changeLens.revertChange', 'changeLens.showChangeDiff'],
  );
  assert.equal(hints[0].position.line, 1, 'чип ставится в конец первой изменённой строки');
  assert.equal(hints[0].position.character, '    <div class="box">'.length);
  assert.match(actions[0].value, /Accept/);
  assert.equal(hints[0].command.command, 'changeLens.showActions');
  assert.deepEqual(hints[0].command.arguments, ['/src/a.php']);

  controller.tracker.accept('/src/a.php');
  controller.updateStatus();
  assert.match(statusItems[0].text, /Change Lens$/);

  extension.deactivate();
});
