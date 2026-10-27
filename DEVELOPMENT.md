# Developing Change Lens

Everything for whoever edits the extension code. End users only need [README](README.md) and the `.vsix` file.

## Layout

| Path | What it is |
| --- | --- |
| `extension/src/extension.js` | file-system watcher, commands, status bar, CodeLens |
| `extension/src/tracker.js` | file snapshots and pending changes (pure logic, no `vscode`) |
| `extension/src/change.js` | one change: before/after plus its diff |
| `extension/src/render.js` | decorations: green lines, red ghost, theme-aware colours |
| `extension/src/diff.js` | line-based LCS diff with no dependencies |
| `scripts/pack.mjs` | `.vsix` builder with its own ZIP writer (no npm) |
| `scripts/make-icon.mjs` | generates the 128×128 icon with no libraries |
| `test/` | 26 tests running against a mocked VS Code API |

No dependencies: no npm packages, no build step. VS Code loads `extension/src/*.js` as they are.

## Build

```powershell
node scripts/make-icon.mjs     # icon (only needed when the artwork changes)
node scripts/pack.mjs          # dist/change-lens-<version>.vsix
```

The version comes from `extension/package.json`. Install the result:

```powershell
code --install-extension .\dist\change-lens-0.5.0.vsix --force
```

## Tests

```powershell
node test/diff.test.mjs        # 8  — LCS diff
node test/tracker.test.mjs     # 10 — snapshots, accumulation, revert
node test/render.test.mjs      # 4  — decoration geometry
node test/activate.test.mjs    # 2  — activation against a mock VS Code API
node test/scenario.test.mjs    # 2  — real file change and git suppression
```

`test/vscode-mock.mjs` replaces the `vscode` module, so everything runs in plain Node.
Integration with the real VS Code is not automated and is checked by hand.

## How it works inside

1. `activate` creates a `Controller`, which snapshots the workspace (`findFiles` + `fs.stat`/`readFile`).
2. `createFileSystemWatcher('**/*')` catches writes to disk; a second watcher on `**/.git/**` catches git operations.
3. `ChangeTracker` compares the new text with the snapshot; `Change` computes the diff.
4. `Decorations` renders whole-line highlights and an `after` ghost for deleted lines.
5. The CodeLens provider returns buttons for any document that has a pending change.

## Publishing

```powershell
git remote add origin https://github.com/<account>/change-lens.git
git push -u origin main
```

Attach the `.vsix` from `dist/` to a GitHub release — that way users do not need Node.js.

For the Marketplace: `publisher` in `extension/package.json` is currently `pilich` — replace it with your
publisher name, then run `npx @vscode/vsce publish`. After publishing, `name` and `publisher` can no longer
change: the extension id would change and existing installs would stop receiving updates.
