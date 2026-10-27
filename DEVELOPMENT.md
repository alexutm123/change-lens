# Разработка Change Lens

Всё для того, кто меняет код расширения. Пользователю это не нужно — ему достаточно
[README](README.md) и файла `.vsix`.

## Структура

| Путь | Что это |
| --- | --- |
| `extension/src/extension.js` | наблюдатель за диском, команды, статус-бар, CodeLens |
| `extension/src/tracker.js` | снимки файлов и накопление изменений (чистая логика, без `vscode`) |
| `extension/src/change.js` | одно изменение: было/стало + дифф |
| `extension/src/render.js` | подсветка: зелёные строки, красный «призрак», цвета под тему |
| `extension/src/diff.js` | построчный LCS-дифф без зависимостей |
| `scripts/pack.mjs` | сборка `.vsix` собственным ZIP-писателем (без npm) |
| `scripts/make-icon.mjs` | генерация иконки 128×128 без библиотек |
| `test/` | 26 тестов на заглушке API VS Code |

Зависимостей нет: ни npm-пакетов, ни сборки. VS Code грузит `extension/src/*.js` как есть.

## Сборка пакета

```powershell
node scripts/make-icon.mjs     # иконка (нужна только при смене картинки)
node scripts/pack.mjs          # dist/change-lens-<версия>.vsix
```

Версия берётся из `extension/package.json`. После сборки установить:

```powershell
code --install-extension .\dist\change-lens-0.5.0.vsix --force
```

## Тесты

```powershell
node test/diff.test.mjs        # 8  — LCS-дифф
node test/tracker.test.mjs     # 10 — снимки, накопление, откат
node test/render.test.mjs      # 4  — геометрия подсветки
node test/activate.test.mjs    # 2  — активация на заглушке VS Code API
node test/scenario.test.mjs    # 2  — изменение файла и игнорирование git
```

`test/vscode-mock.mjs` подменяет модуль `vscode`, поэтому всё запускается обычным Node.
Интеграция с настоящим VS Code не автоматизирована — проверяется вручную.

## Как это работает внутри

1. `activate` создаёт `Controller`, тот снимает снимок файлов рабочей папки (`findFiles` + `fs.stat`/`readFile`).
2. `createFileSystemWatcher('**/*')` ловит записи на диск; отдельный watcher `**/.git/**` — операции git.
3. `ChangeTracker` сравнивает новый текст со снимком, `Change` считает дифф.
4. `Decorations` рисует whole-line подсветку и `after`-«призрака» удалённых строк.
5. CodeLens-провайдер отдаёт кнопки для документа, у которого есть изменение.

## Публикация

```powershell
git remote add origin https://github.com/<аккаунт>/change-lens.git
git push -u origin main
```

Файл `.vsix` из `dist/` стоит приложить к релизу на GitHub — так людям не нужен Node.js.

Для Marketplace: `publisher` в `extension/package.json` сейчас `pilich` — замени на своё имя издателя,
затем `npx @vscode/vsce publish`. После публикации менять `name` и `publisher` нельзя: изменится id,
и установленные расширения перестанут обновляться.
