# Change Lens

Shows exactly what changed in a file, right inside VS Code: added lines in green, deleted lines as a red
struck-through ghost, with **Accept**, **Revert** and **Diff** buttons above the block.

Everything is local. No AI requests, no API keys, no settings — the extension compares a snapshot of the
file with what appeared on disk and computes the diff itself.

Works with any tool that writes files: DeepSeek Harness, Claude Code, Cursor, Codex, scripts, generators.
Changes made by git are ignored automatically.

```
 3    <div>{!! $message !!}</div>                    ⌫ deleted (red, struck through)
 ✓ Accept   ⟲ Revert   ⇆ Diff
 4 +  <div class="hint">
 5 +      Check the domain in your dashboard.
 6 +  </div>
```

## How to use it

1. Open your project in VS Code **as a folder**.
2. Reload the window after installing (a new extension is not picked up by an already open window).
3. Work with your agent; it edits files on disk.
4. Changed lines are highlighted and buttons appear above the block.

| Action | How |
| --- | --- |
| List of changed files | `Ctrl+Alt+Shift+D` or click `⑂ Change Lens` in the status bar |
| Accept a change | `Ctrl+Alt+Enter` |
| Revert the file | `Ctrl+Alt+Backspace` |
| Full diff in a separate tab | **Diff** button above the block |
| Extension log | Command palette → **Change Lens: Show Log** |

Status bar: `✦ Change Lens` means no pending changes, `⑂ Change Lens · 2` means two files changed.

## Limitations (honest ones)

- **The snapshot is taken when VS Code starts.** Anything changed while the editor was closed has nothing
  to compare against. Open VS Code first, then work with the agent.
- **The file has to be open** for the highlight to appear immediately; otherwise it shows up when you open
  the file and is always counted in the status bar.
- **Real red lines are impossible** for third-party extensions — that is Copilot's private API. Deleted
  lines are shown as a ghost; the **Diff** button opens a normal diff tab.
- `node_modules`, `vendor`, `storage`, `dist`, `build`, `.git` and similar folders are skipped, as are files
  larger than 512 KB and binary files.
- **Git is ignored:** while git touches its own directory, changes are treated as external and the snapshot
  is just updated. Five seconds after `.git` goes quiet, highlighting works again.
- If you edit or save the file yourself, the change counts as accepted and the highlight is cleared.
