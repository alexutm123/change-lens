# Change Lens

Shows exactly what changed in a file, right inside VS Code: added lines in green, deleted lines as a red
struck-through ghost, with **Accept**, **Revert** and **Diff** buttons above the block. Diffing is done
locally — no AI requests, no API keys, no settings.

Works with any tool that writes files: DeepSeek Harness, Claude Code, Cursor, Codex, scripts, generators.
Changes made by git are ignored automatically.

```
 3    <div>{!! $message !!}</div>                    ⌫ deleted (red, struck through)
 ✓ Accept   ⟲ Revert   ⇆ Diff
 4 +  <div class="hint">
 5 +      Check the domain in your dashboard.
 6 +  </div>
```

## Install

All you need is VS Code **1.90 or newer**. No Node.js, no npm, no DeepSeek account.

1. Download `change-lens-0.5.0.vsix` (from `dist/` or from Releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → pick the file.
3. Reload the window: `Ctrl+Shift+P` → **Developer: Reload Window**.

That's it. `✦ Change Lens` shows up in the status bar.

<details>
<summary>Install from the terminal</summary>

```powershell
code --install-extension .\change-lens-0.5.0.vsix --force
```
</details>

## Usage

1. Open your project in VS Code **as a folder** (not a single file).
2. Work with your agent as usual — it edits files.
3. Changed lines are highlighted, and `⑂ Change Lens · N` appears in the status bar.

| Action | How |
| --- | --- |
| List of changed files | `Ctrl+Alt+Shift+D` or click `⑂ Change Lens` |
| Accept a change | `Ctrl+Alt+Enter` |
| Revert the file | `Ctrl+Alt+Backspace` |
| Full diff in a separate tab | **Diff** button above the block |
| Extension log | `Ctrl+Shift+P` → **Change Lens: Show Log** |

`✦ Change Lens` in the status bar is just an indicator: `✦` means no changes, `⑂` means there are some.

## Good to know

- **The snapshot is taken when VS Code starts.** Anything changed while the editor was closed has nothing
  to compare against. Open VS Code first, then work with the agent.
- **The file has to be open** for the highlight to appear immediately. Otherwise the change is counted in
  the status bar and highlighted once you open the file.
- **Real red lines are impossible** for third-party extensions — that is Copilot's private API. Deleted
  lines are therefore shown as a ghost, and the **Diff** button opens a normal diff tab.
- Skipped: `node_modules`, `vendor`, `storage`, `dist`, `build`, `.git` and similar folders, files larger
  than 512 KB, and binary files.
- **Git is ignored:** while git is touching its own directory (a sign of `pull`, `checkout`, `merge`,
  `rebase`, `stash`), changes are treated as external and not highlighted — the snapshot is just updated.
  Five seconds after `.git` goes quiet, highlighting works again.
- If you edit or save the file yourself, the change counts as accepted and the highlight is cleared.

## Development

Build, tests, project layout and publishing: [DEVELOPMENT.md](DEVELOPMENT.md).

## License

MIT — see [LICENSE](LICENSE).
