# Іконки інтерфейсу

Інтерфейс використовує власні SVG-форми з `assets/icon-pack/`. Бібліотеки іконок не підключені. Компонент `src/components/Icon.tsx` малює їх у сітці `24 × 24` з обводкою `currentColor`; розміри у використанні стандартизовані до 16, 20 і 24 px.

## Використовуються

| Іконка | Призначення | Де показується |
| --- | --- | --- |
| `add` | Додати файли | Кнопка вибору файлів у `src/components/DropZone.tsx` (16 px) |
| `arrowRight` | Відкрити результат | Дія рядка черги у `src/components/QueueItem.tsx` (20 px) |
| `chevron` | Відкрити вибір режиму або теки | Кнопка режиму в `src/components/ModeSelect.tsx` та тека результатів у `src/components/SettingsPanel.tsx` (16 px) |
| `clock` | Послідовна обробка | Підпис нижньої панелі черги у `src/App.tsx` (20 px) |
| `close` | Скасувати або закрити повідомлення | Дії черги та сповіщення у `src/App.tsx` (16 px) |
| `cpu` | Стан обчислювальної системи | Верхня панель і `src/components/SystemPanel.tsx` (16, 20 px) |
| `check` | Підтвердити готовність компонентів системи | Статус FFmpeg та QSV у `src/components/SystemPanel.tsx` (16 px) |
| `film` | Відеофайл | Порожня черга у `src/App.tsx`, зона додавання у `src/components/DropZone.tsx`, рядок черги у `src/components/QueueItem.tsx` (24 px) |
| `folder` | Вибрати теку або відкрити результат | `src/components/DropZone.tsx`, `src/components/SettingsPanel.tsx`, `src/components/QueueItem.tsx` (16, 20 px) |
| `grip` | Перетягнути для зміни порядку | Дескриптор рядка черги у `src/components/QueueItem.tsx` (16 px) |
| `info` | Інформаційний стан | Вебперегляд, runtime-стан і сповіщення у `src/App.tsx` (16, 20 px) |
| `pause` | Зупинити чергу після поточного завдання | Кнопка черги у `src/App.tsx` (16 px) |
| `play` | Запустити або продовжити чергу | Кнопка черги у `src/App.tsx` (16 px) |
| `refresh` | Повторити завдання | Дія рядка черги у `src/components/QueueItem.tsx` (20 px) |
| `skipForward` | Пропустити відео | Дія рядка черги у `src/components/QueueItem.tsx` (20 px) |
| `trash` | Очистити готові або вилучити завдання | `src/App.tsx` (16 px) і `src/components/QueueItem.tsx` (20 px) |

## Фірмовий знак

Кастомний знак Video Optimizer рендериться компонентом `src/components/BrandMark.tsx` у верхній панелі (32 px). Частини знака використовують токени `--color-accent` і `--color-ink`.
і відповідає SVG-файлу `assets/brand/videooptimus-symbol.svg`. Це окрема фірмова
форма, а не іконка з набору інтерфейсу.

## Зарезервовані

| Іконка | Призначення |
| --- | --- |
| `arrowDown` | Стара дія переміщення завдання вниз; порядок змінюється перетягуванням |
| `arrowUp` | Стара дія переміщення завдання вгору; порядок змінюється перетягуванням |
| `compress` | Стиснення відео |
| `hardDrive` | Локальний диск / сховище |
| `more` | Додаткові дії |
| `shield` | Приватність і локальна обробка |
| `sparkle` | Параметри стиснення |
| `warning` | Попередження |
| `arrowLeft` | Перехід назад |
