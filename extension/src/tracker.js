'use strict';

const { Change, normalize } = require('./change');
const { diffLines } = require('./diff');

/**
 * Хранилище «снимков» файлов и непринятых изменений.
 *
 * Чистая логика без `vscode` и без обращений к диску — всё, что нужно
 * для диффа, приходит снаружи. Так трекер можно проверять тестами.
 */
class ChangeTracker {
  constructor() {
    /** @type {Map<string, string>} путь → последнее известное содержимое */
    this.baselines = new Map();
    /** @type {Map<string, Change>} путь → непринятое изменение */
    this.changes = new Map();
    /** @type {Map<string, string>} путь → uri, как его знает VS Code */
    this.uris = new Map();
    this.seq = 0;
  }

  /**
   * Запомнить исходное состояние файла.
   * @param {string} path
   * @param {string} text
   * @param {string} [uri]
   */
  setBaseline(path, text, uri) {
    this.baselines.set(path, text);
    if (uri) this.uris.set(path, uri);
  }

  /**
   * @param {string} path
   * @returns {string | undefined}
   */
  baseline(path) {
    return this.baselines.get(path);
  }

  /**
   * Файл изменился на диске. Возвращает изменение, если содержимое реально поменялось.
   * @param {string} path
   * @param {string} text
   * @param {string} uri
   * @returns {Change | null}
   */
  noteDisk(path, text, uri) {
    const previous = this.changes.get(path);
    const before = previous ? previous.before : this.baselines.get(path);

    this.baselines.set(path, text);
    this.uris.set(path, uri);

    if (before === undefined || normalize(before) === normalize(text)) {
      this.changes.delete(path);
      return null;
    }

    const change = new Change({
      id: String(++this.seq),
      path,
      uri,
      before,
      after: text,
      kind: 'agent',
    });
    this.changes.set(path, change);
    return change;
  }

  /**
   * Пользователь правит файл, но ещё не сохранил. Дифф считаем заново
   * от исходной версии, чтобы подсветка не пропадала на первом же нажатии.
   * @param {string} path
   * @param {string} text
   * @returns {Change | undefined}
   */
  noteLiveEdit(path, text) {
    const change = this.changes.get(path);
    if (!change) return undefined;
    change.after = text;
    change.diff = diffLines(change.before, text);
    return change;
  }

  /**
   * Пользователь сохранил файл. Снимок обновляем, но разбор изменения
   * не закрываем — оно снимается только кнопками Accept или Revert.
   * @param {string} path
   * @param {string} text
   * @param {string} [uri]
   */
  noteSavedLocally(path, text, uri) {
    this.baselines.set(path, text);
    if (uri) this.uris.set(path, uri);
    const change = this.changes.get(path);
    if (change) {
      change.after = text;
      change.diff = diffLines(change.before, text);
    }
  }

  /**
   * Пользователь сам изменил/сохранил файл — это становится новой базой,
   * а старое непринятое изменение сбрасывается.
   * @param {string} path
   * @param {string} text
   * @param {string} [uri]
   */
  noteLocalText(path, text, uri) {
    this.baselines.set(path, text);
    if (uri) this.uris.set(path, uri);
    this.changes.delete(path);
  }

  /**
   * Зарегистрировать правку, сделанную самим расширением (inline-edit).
   * @param {object} init
   * @returns {Change}
   */
  noteEdit(init) {
    const change = new Change({
      ...init,
      id: String(++this.seq),
      kind: 'edit',
    });
    this.changes.set(change.path, change);
    return change;
  }

  /**
   * @param {string} path
   * @returns {Change | undefined}
   */
  get(path) {
    return this.changes.get(path);
  }

  /**
   * @param {string} path
   * @returns {string | undefined} содержимое до правки
   */
  revert(path) {
    const change = this.changes.get(path);
    if (!change) return undefined;
    this.changes.delete(path);
    this.baselines.set(path, change.before);
    return change.before;
  }

  /**
   * @param {string} path
   */
  accept(path) {
    this.changes.delete(path);
  }

  /** @returns {Change[]} */
  list() {
    return [...this.changes.values()].sort((a, b) => b.at - a.at);
  }

  /** @returns {number} */
  get size() {
    return this.changes.size;
  }

  clear() {
    this.changes.clear();
  }
}

module.exports = { ChangeTracker };
