// Заглушка API VS Code: ровно те поверхности, которые использует расширение.
import Module from 'node:module';

class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }
  fire(value) {
    for (const listener of this.listeners) listener(value);
  }
  dispose() {
    this.listeners.clear();
  }
}

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(a, b, c, d) {
    if (a instanceof Position) {
      this.start = a;
      this.end = b;
    } else {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    }
  }
}

export function installVscodeMock() {
  const commands = new Map();
  const statusItems = [];
  const decorationTypes = [];

  const vscode = {
    EventEmitter,
    Position,
    Range,
    CodeLens: class {
      constructor(range, command) {
        this.range = range;
        this.command = command;
      }
    },
    MarkdownString: class {
      appendMarkdown() { return this; }
      appendCodeblock() { return this; }
    },
    ThemeColor: class {
      constructor(id) { this.id = id; }
    },
    Uri: {
      parse: (value) => ({
        scheme: value.split(':')[0],
        path: value,
        query: '',
        toString: () => value,
        with: (patch) => ({ scheme: value.split(':')[0], path: value, toString: () => `${value}?${patch.query}`, ...patch }),
      }),
      file: (p) => ({ fsPath: p, toString: () => `file:///${p}`, path: p }),
      joinPath: (base, name) => vscode.Uri.file(`${base.fsPath}/${name}`),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Window: 10, Notification: 15 },
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    QuickPickItemKind: { Separator: -1 },
    FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    window: {
      activeTextEditor: undefined,
      visibleTextEditors: [],
      activeColorTheme: { kind: 2 },
      createStatusBarItem: () => {
        const item = {
          text: '',
          tooltip: '',
          command: '',
          visible: false,
          show() { this.visible = true; },
          hide() { this.visible = false; },
          dispose() {},
        };
        statusItems.push(item);
        return item;
      },
      createOutputChannel: () => ({ lines: [], appendLine(line) { this.lines.push(line); }, show() {}, dispose() {} }),
      createTextEditorDecorationType: (options) => {
        const type = { options, disposed: false, dispose() { this.disposed = true; } };
        decorationTypes.push(type);
        return type;
      },
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => undefined,
      showErrorMessage: async () => undefined,
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      setStatusBarMessage: () => ({ dispose() {} }),
      withProgress: async (_options, task) => task(
        { report: () => {} },
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) },
      ),
      onDidChangeActiveTextEditor: () => ({ dispose() {} }),
      onDidChangeActiveColorTheme: () => ({ dispose() {} }),
    },
    workspace: {
      textDocuments: [],
      getConfiguration: () => ({
        get: (key, fallback) => (key === 'credentialsPath' ? 'C:\\no-such-dir\\.credentials.yaml' : fallback),
        update: async () => undefined,
      }),
      registerTextDocumentContentProvider: () => ({ dispose() {} }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidSaveTextDocument: () => ({ dispose() {} }),
      onDidOpenTextDocument: () => ({ dispose() {} }),
      createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose() {} }),
        onDidCreate: () => ({ dispose() {} }),
        onDidDelete: () => ({ dispose() {} }),
        dispose() {},
      }),
      findFiles: async () => [],
      applyEdit: async () => true,
      asRelativePath: (uri) => String(uri),
      fs: {
        stat: async () => ({ type: 1, size: 10, ctime: 0, mtime: 0 }),
        readFile: async () => new Uint8Array(),
        createDirectory: async () => undefined,
        writeFile: async () => undefined,
        delete: async () => undefined,
      },
    },
    languages: {
      registerCodeLensProvider: (_selector, provider) => {
        vscode.__lensProvider = provider;
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand: (id, handler) => {
        commands.set(id, handler);
        return { dispose: () => commands.delete(id) };
      },
      executeCommand: async () => undefined,
      getCommands: async () => [...commands.keys()],
    },
  };

  const resolveFilename = Module._resolveFilename;
  if (!Module.__dshMockPatched) {
    Module._resolveFilename = function patched(request, ...rest) {
      if (request === 'vscode') return '/vscode-mock.js';
      return resolveFilename.call(this, request, ...rest);
    };
    Module.__dshMockPatched = true;
  }
  Module._cache['/vscode-mock.js'] = {
    id: '/vscode-mock.js',
    filename: '/vscode-mock.js',
    loaded: true,
    exports: vscode,
  };

  return { vscode, commands, statusItems, decorationTypes };
}
