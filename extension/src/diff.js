'use strict';

/**
 * Построчный дифф без внешних зависимостей.
 *
 * Алгоритм: срезаем общий префикс и суффикс, для середины считаем LCS
 * динамическим программированием (середина после среза обычно крошечная).
 * Для патологических случаев (огромная переписанная середина) откатываемся
 * к «удалить всё — вставить всё»: подсветка всё равно будет верной, просто
 * блоками.
 */

const DP_CELL_LIMIT = 4_000_000;

/**
 * @param {string} text
 * @returns {string[]}
 */
function toLines(text) {
  if (text === '') return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  // Финальный перевод строки не создаёт отдельную «строку содержимого»,
  // но для сопоставления с документом VS Code это удобно сохранить.
  return lines;
}

/**
 * @typedef {{ type: 'equal' | 'delete' | 'insert', text: string }} Op
 */

/**
 * LCS-диф двух массивов строк.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Op[]}
 */
function lcsOps(a, b) {
  if (a.length === 0) return b.map((text) => ({ type: 'insert', text }));
  if (b.length === 0) return a.map((text) => ({ type: 'delete', text }));
  if (a.length * b.length > DP_CELL_LIMIT) {
    return [
      ...a.map((text) => /** @type {Op} */ ({ type: 'delete', text })),
      ...b.map((text) => /** @type {Op} */ ({ type: 'insert', text })),
    ];
  }

  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  /** @type {Op[]} */
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: 'delete', text: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'insert', text: b[j] });
      j += 1;
    }
  }
  while (i < n) { ops.push({ type: 'delete', text: a[i] }); i += 1; }
  while (j < m) { ops.push({ type: 'insert', text: b[j] }); j += 1; }
  return ops;
}

/**
 * @typedef {object} Hunk
 * @property {number} newStart   Индекс первой добавленной строки в новом тексте (0-based).
 * @property {number} newCount   Сколько строк добавлено.
 * @property {number} removedCount
 * @property {string[]} removed  Удалённые строки (в порядке следования).
 * @property {string[]} added    Добавленные строки.
 * @property {number} oldStart   Индекс первой удалённой строки в старом тексте (0-based).
 */

/**
 * Сравнить два текста построчно.
 * @param {string} oldText
 * @param {string} newText
 * @returns {{ hunks: Hunk[], added: number, removed: number, changed: boolean }}
 */
function diffLines(oldText, newText) {
  const a = toLines(oldText);
  const b = toLines(newText);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const ops = lcsOps(a.slice(start, endA), b.slice(start, endB));

  /** @type {Hunk[]} */
  const hunks = [];
  /** @type {Hunk | null} */
  let current = null;
  let newLine = start;
  let oldLine = start;

  const close = () => {
    if (current) {
      hunks.push(current);
      current = null;
    }
  };

  for (const op of ops) {
    if (op.type === 'equal') {
      close();
      newLine += 1;
      oldLine += 1;
      continue;
    }
    if (!current) {
      current = {
        newStart: newLine,
        newCount: 0,
        removedCount: 0,
        removed: [],
        added: [],
        oldStart: oldLine,
      };
    }
    if (op.type === 'insert') {
      current.added.push(op.text);
      current.newCount += 1;
      newLine += 1;
    } else {
      current.removed.push(op.text);
      current.removedCount += 1;
      oldLine += 1;
    }
  }
  close();

  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    added += hunk.newCount;
    removed += hunk.removedCount;
  }

  return { hunks, added, removed, changed: hunks.length > 0 };
}

module.exports = { diffLines, toLines };
