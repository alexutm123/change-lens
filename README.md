# DeepSeek Harness — Inline Diff для VS Code

Расширение следит за файлами на диске и подсвечивает в VS Code то, что изменила модель:
зелёные добавленные строки, красный «призрак» удалённых, кнопки **Оставить / Вернуть / Дифф**.
Дифф считается локально по снимкам файлов — **без запросов к ИИ, без ключей, без настроек**.

Работает с любым агентом, который пишет файлы: DeepSeek Harness, Claude Code, Cursor, Codex, git-скрипты.
Изменения, сделанные git, автоматически не подсвечиваются.

## Установка для другого человека

Нужен только VS Code **1.90 или новее**. Ни Node.js, ни npm, ни аккаунт DeepSeek — ничего.

1. Скачать `dist/dsh-inline-edit-0.4.0.vsix` (или взять в Releases).
2. В VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → выбрать файл.
   Либо из терминала:

   ```powershell
   code --install-extension .\dsh-inline-edit-0.4.0.vsix --force
   ```

3. Перезапустить окно VS Code (**Developer: Reload Window**).
4. Открыть проект папкой и работать в Harness. В статус-баре появится `✦ DSH`:
   после первой же правки файла — `⑂ DSH · 1` и подсветка строк.

Если VS Code не даёт установить из-за политики организации — включить
`extensions.allowUnsigned` не нужно (пакет подписан не требует), достаточно разрешить установку из VSIX.

## Как это выглядит

```
 3    <div>{!! $message !!}</div>                    ⌫ удалено (красным, зачёркнуто)
 ✓ Оставить   ⟲ Вернуть   ⇆ Дифф
 4 +  <div class="hint">
 5 +      Проверьте домен в личном кабинете.
 6 +  </div>
```

## Как это работает

1. При запуске запоминается содержимое файлов рабочей папки.
2. Внешняя программа пишет файл → VS Code перечитывает его.
3. Расширение сравнивает новое содержимое со снимком и рисует дифф.
4. «Оставить» — забыть изменение, «Вернуть» — записать старый текст обратно, «Дифф» — обычное сравнение.

Исключения: ваши собственные сохранения, ручные правки в редакторе, операции git,
служебные каталоги (`node_modules`, `vendor`, `storage`, `dist`, `.git` и т.п.),
файлы больше 512 КБ и двоичные.

## Что где лежит

| Путь | Что это |
| --- | --- |
| `extension/src/extension.js` | наблюдатель за диском, команды, статус-бар, CodeLens |
| `extension/src/tracker.js` | снимки файлов и накопление изменений (чистая логика) |
| `extension/src/change.js` | одно изменение: было/стало + дифф |
| `extension/src/render.js` | подсветка: зелёные строки, красный «призрак», цвета под тему |
| `extension/src/diff.js` | построчный LCS-дифф без зависимостей |
| `scripts/pack.mjs`, `make-icon.mjs` | сборка `.vsix` и иконки без npm |
| `test/` | 26 тестов |

## Сборка и проверки

```powershell
node scripts/make-icon.mjs     # иконка (нужна только при смене картинки)
node scripts/pack.mjs          # dist/dsh-inline-edit-0.4.0.vsix
node test/diff.test.mjs        # 8  — LCS-дифф
node test/tracker.test.mjs     # 10 — снимки, накопление, откат
node test/render.test.mjs      # 4  — геометрия подсветки
node test/activate.test.mjs    # 2  — активация на заглушке VS Code API
node test/scenario.test.mjs    # 2  — изменение файла и игнорирование git
```

## Публикация

Репозиторий готов к выкладке: `git init`, `git add .`, `git commit`, `git remote add origin …`, `git push`.
Файл `.vsix` в `dist/` стоит приложить к релизу на GitHub — так людям не нужен Node.js.

Чтобы расширение ставилось одной командой из Marketplace (`code --install-extension <publisher>.dsh-inline-edit`),
нужен аккаунт издателя (Azure DevOps → Personal Access Token) и `npx @vscode/vsce publish`;
поля `publisher` в `extension/package.json` и в манифесте уже заполнены.

## Лицензия

MIT — см. [LICENSE](LICENSE).
