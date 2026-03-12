# siyuan-zk-cal

Calendar view for SiYuan. Visualize and navigate between your daily notes.

<img width="1024" alt="preview" src="https://github.com/AntonioDMaster/siyuan-zk-cal/blob/main/preview.png">

## Usage

After installing the plugin, the calendar view should appear as another SiYuan dock panel.

The plugin reads information from existing notes that meet the conditions specified in the settings and displays it in the form of a calendar.
It is possible to specify a notebook and path (within the notebook) for new and existing notes.
In the plugin settings, it is also possible to specify a template for the name and content of daily and weekly notes.

## Features

- Set default SiYuan Notebook for **daily notes** in plugin settings.
- Create new or open any **daily note** by clicking on corresponding date.
- Use right-click context menu to create or remove notes.
- Visualize your writing with calendar view.

## Customizing the calendar appearance

You can fully customize colors, sizes, and spacing of the calendar view with custom CSS.

**Do not edit the plugin’s source files.**

Add your CSS in one of these places (SiYuan will load it):

- **Custom CSS**: **Settings → Appearance → Custom CSS** (SiYuan uses a file such as `custom.css` in your workspace or theme).
- **Snippet**: Create a `.css` file in your workspace **`data/snippets/`** folder (e.g. `zk-cal-custom.css`), then enable it under **Settings → Appearance → Snippets**.

Paste the following sample into that file. Adjust the variables at the top to your liking; the rules below use them so one change applies everywhere.

```css
/* ========== Zk-Cal full visual customization ========== */
/* Scoped to the calendar dock so it doesn't affect the rest of SiYuan. */

.zk-cal__dock {
    /* Layout */
    --zk-cal-dock-padding: 8px;
    --zk-cal-gap: 8px;
    --zk-cal-gap-tight: 4px;
    --zk-cal-nav-cols: 40px 1fr auto 40px;
    --zk-cal-cell-min-height: 42px;
    --zk-cal-cell-padding: 4px;
    --zk-cal-cell-radius: 6px;
    --zk-cal-dots-gap: 2px;
    --zk-cal-dots-size: 5px;
    --zk-cal-dots-max-width: 42px;
    --zk-cal-meta-gap: 4px;
    --zk-cal-meta-row-gap: 8px;
    --zk-cal-meta-padding-top: 6px;
    /* Typography */
    --zk-cal-font-size-small: 12px;
    --zk-cal-month-weight: 600;
    --zk-cal-meta-title-weight: 600;
    /* Colors (use SiYuan theme vars or your own) */
    --zk-cal-head-color: var(--b3-theme-on-surface-light);
    --zk-cal-border: var(--b3-border-color);
    --zk-cal-day-bg: var(--b3-theme-surface);
    --zk-cal-day-fg: var(--b3-theme-on-surface);
    --zk-cal-today-border: var(--b3-theme-primary);
    --zk-cal-muted-opacity: 0.45;
    --zk-cal-hasnote-bg: var(--b3-theme-primary-lightest);
    --zk-cal-dot-fg: var(--b3-theme-on-surface);
    --zk-cal-weeknum-bg: var(--b3-theme-background);
    --zk-cal-weeknum-fg: var(--b3-theme-on-surface-light);
    --zk-cal-loading-fg: var(--b3-theme-on-surface-light);
    /* Loading state */
    --zk-cal-loading-opacity: 0.6;
    --zk-cal-loading-transition: 160ms ease;
}

.zk-cal__dock {
    padding: var(--zk-cal-dock-padding);
}

.zk-cal {
    gap: var(--zk-cal-gap);
}

.zk-cal__nav {
    grid-template-columns: var(--zk-cal-nav-cols);
    gap: var(--zk-cal-gap-tight);
}

.zk-cal__month {
    font-weight: var(--zk-cal-month-weight);
}

.zk-cal__grid,
.zk-cal__grid-head,
.zk-cal__grid-body,
.zk-cal__week-row {
    gap: var(--zk-cal-gap-tight);
}

.zk-cal__grid--loading {
    opacity: var(--zk-cal-loading-opacity);
    transition: opacity var(--zk-cal-loading-transition);
}

.zk-cal__head {
    color: var(--zk-cal-head-color);
    font-size: var(--zk-cal-font-size-small);
}

.zk-cal__day {
    border: 1px solid var(--zk-cal-border);
    border-radius: var(--zk-cal-cell-radius);
    min-height: var(--zk-cal-cell-min-height);
    background: var(--zk-cal-day-bg);
    color: var(--zk-cal-day-fg);
    padding: var(--zk-cal-cell-padding);
}

.zk-cal__day--today {
    border-color: var(--zk-cal-today-border);
}

.zk-cal__day--muted {
    opacity: var(--zk-cal-muted-opacity);
}

.zk-cal__day--hasnote {
    background: var(--zk-cal-hasnote-bg);
}

.zk-cal__dots {
    gap: var(--zk-cal-dots-gap);
    max-width: var(--zk-cal-dots-max-width);
}

.zk-cal__dot {
    width: var(--zk-cal-dots-size);
    height: var(--zk-cal-dots-size);
    background: var(--zk-cal-dot-fg);
}

.zk-cal__dot--hollow {
    background: transparent;
    border: 1px solid var(--zk-cal-dot-fg);
}

.zk-cal__dot--dotted {
    background: transparent;
    border: 1px dotted var(--zk-cal-dot-fg);
}

.zk-cal__weeknum {
    border: 1px solid var(--zk-cal-border);
    border-radius: var(--zk-cal-cell-radius);
    background: var(--zk-cal-weeknum-bg);
    color: var(--zk-cal-weeknum-fg);
    font-size: var(--zk-cal-font-size-small);
    min-height: var(--zk-cal-cell-min-height);
}

.zk-cal__loading {
    color: var(--zk-cal-loading-fg);
    font-size: var(--zk-cal-font-size-small);
}

.zk-cal__meta {
    border-top: 1px solid var(--zk-cal-border);
    padding-top: var(--zk-cal-meta-padding-top);
    gap: var(--zk-cal-meta-gap);
}

.zk-cal__meta-title {
    font-weight: var(--zk-cal-meta-title-weight);
}

.zk-cal__meta-row {
    gap: var(--zk-cal-meta-row-gap);
    font-size: var(--zk-cal-font-size-small);
}
```

Summary of what each variable controls:

| Variable | Controls |
|----------|----------|
| `--zk-cal-dock-padding` | Padding around the whole calendar in the dock |
| `--zk-cal-gap` | Space between nav, grid, and popover |
| `--zk-cal-gap-tight` | Gaps inside grid (rows, columns, week number) |
| `--zk-cal-nav-cols` | Nav layout: prev button, month, today, next button |
| `--zk-cal-cell-min-height` | Day and week-number cell height |
| `--zk-cal-cell-padding` | Inner padding of day cells |
| `--zk-cal-cell-radius` | Rounded corners of day and week-number cells |
| `--zk-cal-dots-*` | Indicator dots size, gap, and max width |
| `--zk-cal-meta-*` | Popover (title/row font, gaps, top padding) |
| `--zk-cal-font-size-small` | Weekday headers, week number, loading, meta rows |
| `--zk-cal-*-opacity` | Muted (other month) cells; loading overlay |
| Color variables | Headers, borders, day background/text, today border, “has note” background, dots, week number, loading text |

You can replace any `var(--b3-...)` in the sample with your own color (e.g. `#1a1a2e` or `var(--your-theme-variable)`).

## License

MIT License.

## Credits

The code of the following projects was used to create this project:

- [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan)
- [siyuan-note/petal](https://github.com/siyuan-note/petal)
- [siyuan-note/plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte)
- [liamcain/obsidian-calendar-plugin](https://github.com/liamcain/obsidian-calendar-plugin)
- [liamcain/obsidian-daily-notes-interface](https://github.com/liamcain/obsidian-daily-notes-interface)
- [liamcain/obsidian-calendar-ui](https://github.com/liamcain/obsidian-calendar-ui)
- [svchord/siyuan-arco-calendar](https://github.com/svchord/siyuan-arco-calendar)

