# Іконки інтерфейсу

Інтерфейс використовує власні SVG-форми з `assets/icon-pack/`. Бібліотеки іконок не підключені. Компонент `src/components/Icon.tsx` малює їх у сітці `24 × 24` з обводкою `currentColor`; розміри у використанні стандартизовані до 12, 14, 16, 17, 20, 24 і 40 px.

## Використовуються

| Іконка | Призначення | Де показується |
| --- | --- | --- |
| `add` | Додати файли | Кнопка вибору файлів у `src/components/DropZone.tsx` (16 px) |
| `arrowDown` | Менший прогнозований розмір після стиснення | Економія у рядку черги в `src/components/QueueItem.tsx` (12 px) |
| `arrowRight` | Відкрити результат | Дія рядка черги у `src/components/QueueItem.tsx` (20 px) |
| `arrowUp` | Можливе збільшення прогнозованого розміру | Економія у рядку черги в `src/components/QueueItem.tsx` (12 px) |
| `chevron` | Відкрити вибір режиму або теки | Кнопка режиму в `src/components/ModeSelect.tsx` та тека результатів у `src/components/SettingsPanel.tsx` (16 px) |
| `clock` | Послідовна обробка | Підпис нижньої панелі черги у `src/components/VideoWorkspace.tsx` (20 px) |
| `close` | Скасувати або закрити повідомлення | Дії черги та сповіщення у `src/App.tsx` (16 px) |
| `cpu` | Стан обчислювальної системи | Верхня панель і `src/components/SystemPanel.tsx` (16, 20 px) |
| `check` | Успішний статус | Статус FFmpeg та QSV у `src/components/SystemPanel.tsx` і тости успіху у `src/App.tsx` (16 px) |
| `film` | Запасна іконка, якщо мініатюру не вдалося отримати | Порожня черга та `src/components/VideoThumbnail.tsx` (24 px) |
| `folder` | Вибрати теку або відкрити результат | `src/components/DropZone.tsx`, `src/components/SettingsPanel.tsx`, `src/components/QueueItem.tsx` (16, 20 px) |
| `grip` | Перетягнути для зміни порядку | Дескриптор рядка черги у `src/components/QueueItem.tsx` (16 px) |
| `info` | Інформаційний стан | Вебперегляд, runtime-стан і інформаційні тости у `src/App.tsx` (16, 20 px) |
| `pause` | Зупинити чергу після поточного завдання | Кнопка черги у `src/components/VideoWorkspace.tsx` (17 px) |
| `play` | Запустити чергу або відтворити відео | Кнопка черги у `src/components/VideoWorkspace.tsx` та мініатюра у `src/components/VideoThumbnail.tsx` (14, 17 px) |
| `queueRemove` | Вилучити завдання або скасувати очікування | Дії черги у `src/components/VideoWorkspace.tsx` та `src/components/QueueItem.tsx` (17, 20 px) |
| `refresh` | Повторити завдання | Дія рядка черги у `src/components/QueueItem.tsx` (20 px) |
| `skipForward` | Пропустити відео | Дія рядка черги у `src/components/QueueItem.tsx` (20 px) |
| `trash` | Очистити готові відео | Кнопка у `src/components/VideoWorkspace.tsx` (16 px) |
| `videoFile` | Файл відео з позначкою відтворення | Зона додавання у `src/components/DropZone.tsx` (40 px у порожньому стані, 24 px після додавання файлів) |
| `warning` | Попередження та помилка | Відхилені файли й помилки у тостах `src/App.tsx` (16 px) |

## Фірмовий знак

Кастомний знак Video Optimizer рендериться компонентом `src/components/BrandMark.tsx` у верхній панелі (32 px). Частини знака використовують токени `--color-accent` і `--color-ink`.
і відповідає SVG-файлу `assets/brand/videooptimus-symbol.svg`. Це окрема фірмова
форма, а не іконка з набору інтерфейсу.

## Зарезервовані

| Іконка | Призначення |
| --- | --- |
| `compress` | Стиснення відео |
| `hardDrive` | Локальний диск / сховище |
| `more` | Додаткові дії |
| `shield` | Приватність і локальна обробка |
| `sparkle` | Параметри стиснення |
| `arrowLeft` | Перехід назад |
