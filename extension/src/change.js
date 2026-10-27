'use strict';

const { diffLines } = require('./diff');

/**
 * Одно изменение файла: каким он был и каким стал.
 *
 * `before` — состояние, которое мы запомнили до правки (снимок),
 * `after` — состояние после правки. Дифф считается локально, без ИИ.
 */
class Change {
  /**
   * @param {object} init
   * @param {string} init.id
   * @param {string} init.path
   * @param {string} init.uri
   * @param {string} init.before
   * @param {string} init.after
   * @param {'agent' | 'edit'} [init.kind]
   * @param {string} [init.instruction]
   * @param {number} [init.at]
   */
  constructor(init) {
    this.id = init.id;
    this.path = init.path;
    this.uri = init.uri;
    this.before = init.before;
    this.after = init.after;
    this.kind = init.kind || 'agent';
    this.instruction = init.instruction || '';
    this.at = init.at || Date.now();
    this.diff = diffLines(init.before, init.after);
  }

  /** Строка (0-based), на которой показывается панель кнопок. */
  get firstLine() {
    if (this.diff.hunks.length === 0) return 0;
    return this.diff.hunks[0].newStart;
  }

  get summary() {
    return `+${this.diff.added} −${this.diff.removed}`;
  }

  /**
   * Совпадает ли текущий текст документа с тем, что мы записали.
   * @param {string} text
   * @returns {boolean}
   */
  matchesText(text) {
    return normalize(text) === normalize(this.after);
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return String(text).replace(/\r\n/g, '\n');
}

module.exports = { Change, normalize };
