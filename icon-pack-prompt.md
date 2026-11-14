# ТЗ: уникальный SVG-пак иконок Video Optimus

## Цель

Создать 24 согласованные векторные иконки для интерфейса Video Optimus. Пак должен выглядеть как авторская система инструментов для видеомастерской, а не как набор стандартных UI-глифов. Результат генерируется двумя SVG-листами по 12 значков; порядок в сетке задаёт соответствие ключам ниже.

## Арт-направление

- Премиальная минималистичная геометрия с ощущением точного оптического инструмента.
- Чёткие, легко узнаваемые силуэты; индивидуальные пропорции вместо шаблонных библиотечных форм.
- Моноширинная обводка, ориентир 1.7 единицы на сетке 24 × 24; скруглённые окончания и стыки.
- Небольшие характерные вырезы и отрицательное пространство допустимы, но без мелкой декоративной гравировки.
- Один цвет обводки, совместимый с `currentColor`; без градиентов, цветных заливок, бликов и теней.
- Прозрачный фон. Иконки должны оставаться разборчивыми при размере 15–22 px.
- Не копировать узнаваемый стиль конкретного производителя или библиотеки иконок.

## Структура листов

Каждый лист: ровно 12 иконок, сетка 4 колонки × 3 строки, порядок слева направо и сверху вниз. Все ячейки одинаковые, глифы оптически центрированы и имеют равные поля. Не показывать линии ячеек, рамки, подложки, заголовки или подписи.

SVG должен содержать только векторные контуры, без встроенных растровых изображений и эффектов. По возможности оформить каждый значок отдельной группой `<g>` с ID из списка и локальной системой координат 24 × 24; позиционировать группы через `transform`. Видимый текст запрещён.

## Лист 1: действия и навигация

Порядок ячеек:

1. `add` — плюс / добавление
2. `arrowDown` — направление вниз
3. `arrowLeft` — направление влево
4. `arrowRight` — направление вправо
5. `arrowUp` — направление вверх
6. `check` — подтверждение
7. `chevron` — компактный переход / раскрытие
8. `close` — закрытие / отмена
9. `more` — дополнительные действия
10. `grip` — перетаскивание / изменение порядка
11. `refresh` — повтор / обновление
12. `trash` — удаление

## Лист 2: видео, система и состояния

Порядок ячеек:

1. `clock` — очередь и последовательная обработка
2. `cpu` — локальный процессор / кодирование
3. `film` — видео / киноплёнка
4. `folder` — папка
5. `hardDrive` — локальный диск
6. `info` — информация
7. `pause` — пауза
8. `play` — запуск
9. `sparkle` — умная оптимизация
10. `warning` — предупреждение
11. `compress` — сжатие видео
12. `shield` — приватность и локальная обработка

## Промпт: лист 1

```text
Create a premium, original vector SVG icon contact sheet for Video Optimus, a refined desktop video optimization workshop. This is a production asset exploration, not a UI mockup, poster, screenshot, or raster illustration.

Draw EXACTLY these 12 distinct icons, in this exact left-to-right, top-to-bottom order: add (plus), arrowDown, arrowLeft, arrowRight, arrowUp, check, chevron, close, more (three dots), grip (drag handle), refresh, trash.

LAYOUT: precise 4-column by 3-row grid; twelve equal invisible cells; one icon centered in each cell; consistent optical scale, baseline, and generous safe margins. No visible grid, dividers, cards, frames, labels, lettering, numbers, or extra symbols. Transparent background.

ART DIRECTION: elegant precision-engineered geometry with the quiet character of a premium optical instrument. Create bespoke, recognizable forms with subtly considered proportions and clean negative space; avoid generic stock-icon appearance and avoid copying any known icon library. Restrained monoline construction, approximately 1.7 units at a 24 by 24 icon viewBox. Consistent rounded line caps and joins. One solid dark-ink stroke only, no fills except where structurally unavoidable, and no color accents. Crisp, simple silhouettes that remain legible at 15 to 22 pixels.

SVG REQUIREMENTS: output as a genuine editable vector SVG, not a bitmap embedded in SVG. Use only clean paths and basic vector shapes; no filters, gradients, shadows, textures, raster data, or decorative background. Make each icon its own logically separated group with the corresponding lowercase ID: add, arrowDown, arrowLeft, arrowRight, arrowUp, check, chevron, close, more, grip, refresh, trash. Design each group in its own 24 by 24 coordinate space, then position it in the sheet. Do not render the IDs as visible text. Keep all icons stylistically consistent and uncluttered.
```

## Промпт: лист 2

```text
Create a premium, original vector SVG icon contact sheet for Video Optimus, a refined desktop video optimization workshop. This is a production asset exploration, not a UI mockup, poster, screenshot, or raster illustration.

Draw EXACTLY these 12 distinct icons, in this exact left-to-right, top-to-bottom order: clock, cpu, film, folder, hardDrive, info, pause, play, sparkle, warning, compress, shield.

LAYOUT: precise 4-column by 3-row grid; twelve equal invisible cells; one icon centered in each cell; consistent optical scale, baseline, and generous safe margins. No visible grid, dividers, cards, frames, labels, lettering, numbers, or extra symbols. Transparent background.

ART DIRECTION: elegant precision-engineered geometry with the quiet character of a premium optical instrument. Create bespoke, recognizable forms with subtly considered proportions and clean negative space; avoid generic stock-icon appearance and avoid copying any known icon library. Restrained monoline construction, approximately 1.7 units at a 24 by 24 icon viewBox. Consistent rounded line caps and joins. One solid dark-ink stroke only, no fills except where structurally unavoidable, and no color accents. Crisp, simple silhouettes that remain legible at 15 to 22 pixels.

SVG REQUIREMENTS: output as a genuine editable vector SVG, not a bitmap embedded in SVG. Use only clean paths and basic vector shapes; no filters, gradients, shadows, textures, raster data, or decorative background. Make each icon its own logically separated group with the corresponding lowercase ID: clock, cpu, film, folder, hardDrive, info, pause, play, sparkle, warning, compress, shield. Design each group in its own 24 by 24 coordinate space, then position it in the sheet. Do not render the IDs as visible text. Keep all icons stylistically consistent and uncluttered.
```

## Параметры генерации

- Модель: `openai/gpt-image-2.6-flare/text-to-image`
- Формат: `SVG`
- Соотношение сторон: `4:3`
- Разрешение: `2K`
- Качество: `high`
- Сложность: `high`
