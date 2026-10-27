# Changelog

## 0.9.0

- Editing the file no longer drops the review: the diff is recomputed live from the original snapshot, so
  highlighting and the action row stay put while you type.
- Saving keeps the review open too � it is closed only by Accept or Revert.
- Revert asks for confirmation when the file has unsaved edits.

## 0.8.0

- Back to CodeLens: inlay hints are not clickable in some VS Code builds, so the action row moved back to
  a surface whose clicks the editor handles natively.
- Added a More action that opens a menu with Accept / Revert / Diff.

## 0.7.0

- Clicking anywhere on the action chip now opens an actions menu (Accept / Revert / Diff), so the controls
  work even where clicks on individual inlay-hint parts are not supported.
- Accept / Revert / Diff commands take an optional file path, so they no longer depend on the active editor.

## 0.6.0

- The action row (Accept / Revert / Diff) is now an inlay hint instead of CodeLens: it gets a background
  chip and stays clickable, so it reads as buttons rather than grey text.

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
