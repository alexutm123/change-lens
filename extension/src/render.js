'use strict';

const vscode = require('vscode');

/** Цвета подбираются под тему, чтобы подсветка выглядела нативно. */
const PALETTES = {
  dark: {
    addedBackground: 'rgba(63, 185, 80, 0.20)',
    addedBorder: '#3FB950',
    removedBackground: 'rgba(248, 81, 73, 0.16)',
    removedBorder: '#F85149',
    removedText: '#FF7B72',
  },
  light: {
    addedBackground: 'rgba(26, 127, 55, 0.14)',
    addedBorder: '#1A7F37',
    removedBackground: 'rgba(207, 34, 46, 0.12)',
    removedBorder: '#CF222E',
    removedText: '#CF222E',
  },
  highContrast: {
    addedBackground: 'rgba(0, 255, 0, 0.18)',
    addedBorder: '#00FF00',
    removedBackground: 'rgba(255, 0, 0, 0.22)',
    removedBorder: '#FF0000',
    removedText: '#FF6B6B',
  },
};

const MAX_GHOST_CHARS = 110;

/**
 * @param {number} kind
 * @returns {'dark' | 'light' | 'highContrast'}
 */
function paletteName(kind) {
  if (kind === vscode.ColorThemeKind.Light) return 'light';
  if (kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight) {
    return 'highContrast';
  }
  return 'dark';
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function ghostText(lines) {
  const joined = lines.map((line) => line.trim()).filter(Boolean).join(' ↵ ');
  if (joined.length <= MAX_GHOST_CHARS) return joined;
  return `${joined.slice(0, MAX_GHOST_CHARS - 1)}…`;
}

class Decorations {
  constructor() {
    /** @type {vscode.TextEditorDecorationType[]} */
    this.types = [];
    this.palette = null;
    this.themeKind = -1;
  }

  /** Пересоздать типы, если сменилась тема. */
  refresh() {
    const kind = vscode.window.activeColorTheme.kind;
    if (this.themeKind === kind && this.types.length > 0) return;
    this.dispose();
    this.themeKind = kind;
    this.palette = PALETTES[paletteName(kind)];

    this.addedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: this.palette.addedBackground,
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: this.palette.addedBorder,
    });

    this.removedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: this.palette.removedBackground,
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: this.palette.removedBorder,
      opacity: '0.85',
    });

    this.ghostType = vscode.window.createTextEditorDecorationType({
      after: {
        color: this.palette.removedText,
        backgroundColor: this.palette.removedBackground,
        textDecoration: 'line-through',
        fontStyle: 'italic',
        margin: '0 0 0 2em',
      },
    });

    this.types = [this.addedType, this.removedType, this.ghostType];
  }

  /**
   * Показать подсветку изменения.
   * @param {vscode.TextEditor} editor
   * @param {import('./change').Change} change
   */
  async apply(editor, change) {
    this.refresh();
    await this.render(editor, change);
  }

  /**
   * @param {vscode.TextEditor} editor
   * @param {import('./change').Change} change
   */
  async render(editor, change) {
    this.refresh();
    const document = editor.document;
    const startLine = change.startLine || 0;

    /** @type {vscode.DecorationOptions[]} */
    const added = [];
    /** @type {vscode.DecorationOptions[]} */
    const ghost = [];

    for (const hunk of change.diff.hunks) {
      for (let offset = 0; offset < hunk.newCount; offset += 1) {
        const line = startLine + hunk.newStart + offset;
        if (line >= document.lineCount) continue;
        added.push({ range: new vscode.Range(line, 0, line, 0) });
      }

      if (hunk.removedCount > 0) {
        const anchorLine = hunk.newStart > 0
          ? startLine + hunk.newStart - 1
          : startLine;
        if (anchorLine >= document.lineCount) continue;

        const hover = new vscode.MarkdownString();
        hover.appendMarkdown(`**Deleted lines: ${hunk.removedCount}**\n\n`);
        hover.appendCodeblock(hunk.removed.join('\n'), document.languageId);
        hover.appendMarkdown('\nAccept — `Ctrl+Alt+Enter`, revert — `Ctrl+Alt+Backspace`.');

        ghost.push({
          range: new vscode.Range(anchorLine, 0, anchorLine, document.lineAt(anchorLine).text.length),
          hoverMessage: hover,
          renderOptions: {
            after: {
              contentText: `  ⌫ ${ghostText(hunk.removed)}`,
            },
          },
        });
      }
    }

    editor.setDecorations(this.addedType, added);
    editor.setDecorations(this.ghostType, ghost);
  }

  /**
   * @param {vscode.TextEditor} editor
   */
  clear(editor) {
    if (!this.addedType) return;
    editor.setDecorations(this.addedType, []);
    editor.setDecorations(this.ghostType, []);
  }

  dispose() {
    for (const type of this.types) type.dispose();
    this.types = [];
    this.addedType = undefined;
    this.removedType = undefined;
    this.ghostType = undefined;
    this.themeKind = -1;
  }
}

module.exports = { Decorations };
