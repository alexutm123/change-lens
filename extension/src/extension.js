'use strict';

const vscode = require('vscode');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { ChangeTracker } = require('./tracker');
const { Decorations } = require('./render');

const CHANGE_CONTEXT = 'changeLens.change';
const ORIGINAL_SCHEME = 'dsh-original';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_PRIME_FILES = 20_000;
const SELF_WRITE_MS = 5_000;
const USER_SAVE_MS = 1_500;
/** Сколько времени после обращения git к своему каталогу считаем, что файлы меняет git. */
const GIT_QUIET_MS = 5_000;

/** Каталоги, которые не имеет смысла снимать и подсвечивать. */
const PRIME_EXCLUDE = '**/{node_modules,vendor,.git,.svn,storage,dist,build,coverage,public/build,bootstrap/cache}/**';

/** Те же каталоги как сегменты пути — для событий файловой системы. */
const IGNORED_SEGMENTS = new Set([
  'node_modules', 'vendor', '.git', '.svn', 'storage', 'dist', 'build', 'coverage', 'bootstrap',
]);

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isIgnored(filePath) {
  const parts = filePath.split(/[\\/]/);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (IGNORED_SEGMENTS.has(parts[index])) return true;
  }
  return false;
}

/**
 * Полный диапазон документа.
 * @param {vscode.TextDocument} document
 * @returns {vscode.Range}
 */
function fullRange(document) {
  const last = Math.max(0, document.lineCount - 1);
  return new vscode.Range(0, 0, last, document.lineAt(last).text.length);
}

/**
 * Панель действий в виде «чипа» в конце первой изменённой строки.
 *
 * Inlay hints, в отличие от CodeLens, рисуются с фоном и поддерживают
 * кликабельные части — смотрится как кнопки, а не как серый текст.
 */
class ToolbarProvider {
  /**
   * @param {Controller} controller
   */
  constructor(controller) {
    this.controller = controller;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeInlayHints = this.emitter.event;
  }

  refresh() {
    this.emitter.fire();
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.Range} range
   * @returns {vscode.InlayHint[]}
   */
  provideInlayHints(document, range) {
    const change = this.controller.changeFor(document.uri.fsPath);
    if (!change) return [];

    const line = Math.max(0, Math.min(change.firstLine, document.lineCount - 1));
    if (line < range.start.line || line > range.end.line) return [];

    const text = document.lineAt(line).text;
    const position = new vscode.Position(line, text.length);

    /**
     * @param {string} label
     * @param {string} [command]
     * @param {string} [tooltip]
     */
    const part = (label, command, tooltip) => {
      const item = new vscode.InlayHintLabelPart(label);
      if (command) item.command = { title: label, command, tooltip };
      return item;
    };

    const hint = new vscode.InlayHint(position, [
      part(' ✓ Accept ', 'changeLens.acceptChange', 'Accept this change (Ctrl+Alt+Enter)'),
      part(' | '),
      part(' ⟲ Revert ', 'changeLens.revertChange', 'Revert the file (Ctrl+Alt+Backspace)'),
      part(' | '),
      part(' ⧉ Diff ', 'changeLens.showChangeDiff', 'Open the full diff'),
      part(' '),
    ], vscode.InlayHintKind.Type);

    hint.paddingLeft = true;
    hint.paddingRight = true;
    return [hint];
  }
}

class Controller {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.context = context;
    this.output = vscode.window.createOutputChannel('Change Lens');
    this.decorations = new Decorations();
    this.tracker = new ChangeTracker();

    /** @type {Map<string, string>} id изменения → содержимое до правки (для вкладки диффа) */
    this.originals = new Map();
    /** @type {Map<string, number>} наши собственные записи на диск */
    this.selfWrites = new Map();
    /** @type {Map<string, number>} сохранения из самого VS Code */
    this.userSaves = new Map();
    /** @type {Map<string, number>} окна, в которых игнорируем события документа */
    this.suppressed = new Map();

    this.toolbar = new ToolbarProvider(this);
    this.toolbarRegistration = vscode.languages.registerInlayHintsProvider([{ scheme: 'file' }], this.toolbar);

    this.originalProvider = vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_SCHEME, {
      provideTextDocumentContent: (uri) => this.originals.get(uri.query) ?? '',
    });

    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.status.command = 'changeLens.reviewChanges';

    this.acceptItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    this.acceptItem.text = '$(check) Accept';
    this.acceptItem.tooltip = 'Accept this change (Ctrl+Alt+Enter)';
    this.acceptItem.command = 'changeLens.acceptChange';

    this.revertItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    this.revertItem.text = '$(discard) Revert';
    this.revertItem.tooltip = 'Revert the file to its previous state (Ctrl+Alt+Backspace)';
    this.revertItem.command = 'changeLens.revertChange';

    this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
    this.watcher.onDidChange((uri) => this.onDiskChanged(uri));
    this.watcher.onDidCreate((uri) => this.onDiskChanged(uri));

    // Git перед правкой файлов трогает свой служебный каталог — по этим событиям
    // понимаем, что сейчас идут pull/checkout/merge, и не подсвечиваем их.
    this.gitUntil = 0;
    this.gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
    this.gitWatcher.onDidChange(() => this.noteGitActivity());
    this.gitWatcher.onDidCreate(() => this.noteGitActivity());
    this.gitWatcher.onDidDelete(() => this.noteGitActivity());

    this.subscriptions = [
      this.watcher,
      this.gitWatcher,
      vscode.workspace.onDidChangeTextDocument((event) => this.onDocumentChanged(event)),
      vscode.workspace.onDidSaveTextDocument((document) => this.onDocumentSaved(document)),
      vscode.workspace.onDidOpenTextDocument((document) => this.onDocumentOpened(document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.onActiveEditorChanged(editor)),
      vscode.window.onDidChangeActiveColorTheme(() => this.onThemeChanged()),
    ];

    this.updateStatus();
    this.status.show();
    vscode.commands.executeCommand('setContext', CHANGE_CONTEXT, false);

    this.primeSnapshots().catch((error) => this.log(`snapshot failed: ${error && error.message ? error.message : error}`));
  }

  dispose() {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.decorations.dispose();
    this.toolbarRegistration.dispose();
    this.originalProvider.dispose();
    this.status.dispose();
    this.acceptItem.dispose();
    this.revertItem.dispose();
    this.output.dispose();
  }

  // ------------------------------------------------------------ наблюдение

  /**
   * Запомнить исходное состояние файлов, чтобы потом было с чем сравнивать.
   */
  async primeSnapshots() {
    const files = await vscode.workspace.findFiles('**/*', PRIME_EXCLUDE, MAX_PRIME_FILES);
    const chunk = 24;
    let count = 0;

    for (let index = 0; index < files.length; index += chunk) {
      const slice = files.slice(index, index + chunk);
      await Promise.all(slice.map(async (uri) => {
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (!(stat.type & vscode.FileType.File) || stat.size > MAX_FILE_BYTES) return;
          const bytes = await vscode.workspace.fs.readFile(uri);
          if (bytes.includes(0)) return;
          this.tracker.setBaseline(uri.fsPath, Buffer.from(bytes).toString('utf8'));
          count += 1;
        } catch {
          /* файл мог исчезнуть — это не ошибка */
        }
      }));
    }

    this.log(`snapshot ready: ${count} files out of ${files.length}`);
    if (count > 0) {
      vscode.window.setStatusBarMessage(`$(database) Change Lens: ${count} files snapshotted`, 4000);
    }
  }

  /**
   * @param {vscode.Uri} uri
   */
  async onDiskChanged(uri) {
    if (uri.scheme !== 'file') return;
    const filePath = uri.fsPath;
    if (isIgnored(filePath)) return;
    const now = Date.now();

    if ((this.selfWrites.get(filePath) || 0) > now) return;
    if ((this.userSaves.get(filePath) || 0) + USER_SAVE_MS > now) return;

    const document = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === filePath);
    if (document && document.isDirty) return;

    let text;
    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
      text = await fsp.readFile(filePath, 'utf8');
    } catch {
      return;
    }
    if (text.includes('\u0000')) return;

    // Идёт git-операция: просто обновляем снимок, чтобы её результат не всплыл потом.
    if (Date.now() < this.gitUntil) {
      this.tracker.noteLocalText(filePath, text, uri.toString());
      this.decorate(filePath);
      this.refresh();
      return;
    }

    const change = this.tracker.noteDisk(filePath, text, uri.toString());
    if (change) {
      this.log(`change: ${vscode.workspace.asRelativePath(filePath)} ${change.summary}`);
      this.decorate(filePath);
    }
    this.refresh();
  }

  /**
   * @param {vscode.TextDocumentChangeEvent} event
   */
  onDocumentChanged(event) {
    const document = event.document;
    if (document.uri.scheme !== 'file') return;
    const filePath = document.uri.fsPath;

    if (this.isSuppressed(filePath)) return;

    if (document.isDirty) {
      // Пользователь сам начал править файл — изменение считается принятым.
      if (this.tracker.get(filePath)) {
        this.tracker.accept(filePath);
        this.decorate(filePath);
        this.refresh();
      }
      return;
    }

    // Документ перечитан с диска — перерисовываем подсветку под новое содержимое.
    this.decorate(filePath);
  }

  /**
   * @param {vscode.TextDocument} document
   */
  onDocumentSaved(document) {
    if (document.uri.scheme !== 'file') return;
    const filePath = document.uri.fsPath;
    this.userSaves.set(filePath, Date.now());
    this.tracker.noteLocalText(filePath, document.getText(), document.uri.toString());
    this.decorate(filePath);
    this.refresh();
  }

  /**
   * @param {vscode.TextDocument} document
   */
  onDocumentOpened(document) {
    if (document.uri.scheme !== 'file') return;
    if (!this.tracker.get(document.uri.fsPath)) return;
    Promise.resolve().then(() => this.decorate(document.uri.fsPath));
  }

  /**
   * @param {vscode.TextEditor | undefined} editor
   */
  onActiveEditorChanged(editor) {
    if (editor) this.decorateEditor(editor);
    this.updateContext();
  }

  onThemeChanged() {
    this.decorations.dispose();
    for (const editor of vscode.window.visibleTextEditors) this.decorateEditor(editor);
  }

  // ------------------------------------------------------------- подсветка

  /**
   * @param {string} filePath
   * @returns {import('./change').Change | undefined}
   */
  changeFor(filePath) {
    return this.tracker.get(filePath);
  }

  /**
   * @param {string} filePath
   */
  async decorate(filePath) {
    const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.fsPath === filePath);
    if (editor) await this.decorateEditor(editor);
    this.updateContext();
  }

  /**
   * @param {vscode.TextEditor} editor
   */
  async decorateEditor(editor) {
    const filePath = editor.document.uri.fsPath;
    const change = this.tracker.get(filePath);
    if (!change) {
      this.decorations.clear(editor);
      return;
    }
    // Файл правят вручную — подсветка чужого изменения только запутает.
    if (editor.document.isDirty) {
      this.decorations.clear(editor);
      return;
    }
    // Документ ещё не перечитан с диска — дождёмся onDidChangeTextDocument.
    if (!change.matchesText(editor.document.getText())) {
      this.decorations.clear(editor);
      return;
    }
    await this.decorations.apply(editor, change);
  }

  // --------------------------------------------------------------- команды

  async acceptChange() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    if (!this.tracker.get(filePath)) return;
    this.tracker.accept(filePath);
    this.decorations.clear(editor);
    this.refresh();
    vscode.window.setStatusBarMessage('$(check) Change accepted', 3000);
  }

  async revertChange() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    const change = this.tracker.get(filePath);
    if (!change) {
      vscode.window.showInformationMessage('There is no change to revert.');
      return;
    }

    const document = editor.document;
    this.suppress(filePath, 4000);
    this.selfWrites.set(filePath, Date.now() + SELF_WRITE_MS);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange(document), change.before);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) await document.save();

    this.tracker.revert(filePath);
    this.decorations.clear(editor);
    this.refresh();
    vscode.window.setStatusBarMessage('$(history) File reverted', 4000);
  }

  async showChangeDiff() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    const change = this.tracker.get(filePath);
    if (!change) {
      vscode.window.showInformationMessage('No pending changes in this file.');
      return;
    }

    this.originals.set(change.id, change.before);
    const name = path.basename(filePath) || 'file';
    const left = vscode.Uri.parse(`${ORIGINAL_SCHEME}:/${encodeURI(name)}`).with({ query: change.id });
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      editor.document.uri,
      `Change Lens · ${name}: before ↔ after`,
    );
  }

  async reviewChanges() {
    const changes = this.tracker.list();
    if (changes.length === 0) {
      vscode.window.showInformationMessage('No changes made by an agent right now.');
      return;
    }

    const items = changes.map((change) => ({
      label: `$(file) ${vscode.workspace.asRelativePath(change.path)}`,
      description: change.summary,
      detail: 'changed on disk',
      change,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: `Files changed: ${changes.length}`,
      placeHolder: 'Pick a file to open with highlighting',
    });
    if (!picked) return;

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.change.path));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    await this.decorateEditor(editor);
    this.updateContext();
  }

  showOutput() {
    this.output.show(true);
  }

  // ------------------------------------------------------------- сервисное

  /**
   * @param {string} filePath
   * @param {number} ms
   */
  suppress(filePath, ms) {
    this.suppressed.set(filePath, Date.now() + ms);
  }

  /**
   * Git тронул свой служебный каталог — значит, сейчас переписывает файлы.
   */
  noteGitActivity() {
    const now = Date.now();
    const wasQuiet = this.gitUntil < now;
    this.gitUntil = now + GIT_QUIET_MS;
    if (wasQuiet) this.log('git: operation in progress, its changes are suppressed');
  }

  /**
   * @param {string} filePath
   * @returns {boolean}
   */
  isSuppressed(filePath) {
    return (this.suppressed.get(filePath) || 0) > Date.now();
  }

  refresh() {
    this.toolbar.refresh();
    this.updateStatus();
    this.updateContext();
  }

  updateContext() {
    const editor = vscode.window.activeTextEditor;
    const hasChange = !!(editor && this.tracker.get(editor.document.uri.fsPath));
    vscode.commands.executeCommand('setContext', CHANGE_CONTEXT, hasChange);
    if (hasChange) {
      this.acceptItem.show();
      this.revertItem.show();
    } else {
      this.acceptItem.hide();
      this.revertItem.hide();
    }
  }

  updateStatus() {
    const count = this.tracker.size;
    this.status.text = count > 0 ? `$(diff) Change Lens · ${count}` : '$(sparkle) Change Lens';
    this.status.tooltip = count > 0
      ? `Files changed: ${count}. Click to review.`
      : 'Change Lens: watching for file changes. Ctrl+Alt+Shift+D — review changes.';
    this.status.command = 'changeLens.reviewChanges';
    this.status.show();
  }

  reportError(error) {
    this.log(`! ${error && error.stack ? error.stack : error}`);
    vscode.window
      .showErrorMessage(`Change Lens: ${error && error.message ? error.message : error}`, 'Show Log')
      .then((choice) => {
        if (choice === 'Show Log') this.showOutput();
      });
  }

  log(message) {
    this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}

/** @type {Controller | undefined} */
let controller;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  controller = new Controller(context);
  context.subscriptions.push(controller);
  context.subscriptions.push(
    vscode.commands.registerCommand('changeLens.acceptChange', () => controller.acceptChange()),
    vscode.commands.registerCommand('changeLens.revertChange', () => controller.revertChange()),
    vscode.commands.registerCommand('changeLens.showChangeDiff', () => controller.showChangeDiff()),
    vscode.commands.registerCommand('changeLens.reviewChanges', () => controller.reviewChanges()),
    vscode.commands.registerCommand('changeLens.showOutput', () => controller.showOutput()),
  );

  return {
    controller,
    acceptChange: () => controller.acceptChange(),
    revertChange: () => controller.revertChange(),
    reviewChanges: () => controller.reviewChanges(),
    tracker: controller.tracker,
  };
}

function deactivate() {
  if (controller) {
    controller.dispose();
    controller = undefined;
  }
}

module.exports = { activate, deactivate };
