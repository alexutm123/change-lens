# Changelog

## 0.5.0

- Renamed to **Change Lens** (was "DeepSeek Harness — Inline Diff").
- New package id: `pilich.change-lens`, commands `changeLens.*`, status bar `✦ Change Lens`.
- Emphasis on being tool-agnostic: works with any agent or tool that writes files.
- The old `deepseek-harness.dsh-inline-edit` version must be uninstalled — otherwise two extensions run at once.

## 0.4.0

- Changes made by git (`pull`, `checkout`, `merge`, `rebase`, `stash`, etc.) are no longer highlighted.
  The signal is git touching its own `.git` directory; the snapshot is simply updated at that time.
- Highlighting resumes five seconds after `.git` goes quiet.

## 0.3.0

- Removed everything unnecessary: the "edit code with DeepSeek" command, API keys, model settings.
  Nothing to type or configure in VS Code anymore.
- Only one thing left: highlighting the changes an agent makes to files on disk.
- Accept / Revert / Diff buttons, status bar counter, list of changed files.

## 0.2.0

- Highlight changes made by the harness: file snapshots at startup and a local diff.
- Accept / Revert / Diff buttons, status bar, list of changed files.

## 0.1.0

- First version: inline editing of the selected fragment through the DeepSeek API (removed in 0.3.0).
