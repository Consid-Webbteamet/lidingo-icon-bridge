# Lidingo Icon Bridge

## Purpose
This plugin replaces the default ACF icon picker (Material symbols) with Lidingo ligature tokens (for example `:blink:`), and keeps frontend icon rendering compatible with existing Municipio icon markup.

## What It Does
- Overrides `window.getAcfIcons` in admin/block editor and uses a local JSON catalog.
- Renders picker preview/list with the Lidingo icon font.
- Enqueues frontend/admin CSS that renders token values on `.c-icon[data-material-symbol=":token:"]`.
- Keeps legacy Material values readable in admin preview until an editor re-selects an icon.

## Files
- `lidingo-icon-bridge.php`
  - WordPress hooks and enqueue logic.
  - Filter support for font and catalog sources.
- `assets/js/lidingo-acf-icon-picker.js`
  - Picker override, search, selection, preview rendering.
- `assets/css/lidingo-icons.css`
  - Font and icon rendering styles for admin and frontend.
- `assets/data/lidingo-icon-catalog.json`
  - Token catalog used by picker search/list.

## Runtime Flow
1. Plugin enqueues JS in admin/editor.
2. JS replaces global `getAcfIcons`.
3. On open (and auto-init), JS loads catalog JSON once and initializes each icon field.
4. Selected token is stored in hidden ACF input.
5. Frontend renders icon from `data-material-symbol` when value is token-formatted.

## Configurable Filters
- `lidingo_icon_bridge/font_medium_url`
- `lidingo_icon_bridge/font_regular_url`
- `lidingo_icon_bridge/catalog_url`
- `lidingo_icon_bridge/catalog_version`

By default:
- `font_regular_url` resolves to `wp-content/plugins/lidingo-icon-bridge/assets/fonts/lidingological-regular.woff2`
- `font_medium_url` resolves to `wp-content/plugins/lidingo-icon-bridge/assets/fonts/lidingological-medium.woff2`

Both files are loaded as the same `Lidingo Logical` font family with separate weights:
- Regular: `font-weight: 400`
- Medium: `font-weight: 500`

Default rendering is medium (`500`). Use manual CSS selectors/classes to force regular (`400`) where needed.

Example:

```php
add_filter('lidingo_icon_bridge/catalog_url', function () {
    return content_url('/uploads/icons/lidingo-icon-catalog.json');
});
```

## Catalog Format
Each item in `lidingo-icon-catalog.json` must use:

```json
{
  "token": ":blink:",
  "label": "Blink",
  "keywords": ["wink", "smile", "emoji"]
}
```

Rules:
- `token` must match `:...:`
- `label` should be human readable
- `keywords` is optional but recommended for search quality

## Notes
- The plugin does not modify Municipio core or MU plugin source.
- Icon rendering defaults to medium Lidingo weight (`500`), with optional manual per-token overrides to regular (`400`).
- Existing Material icon values are preserved and still displayed in admin preview.
- Catalog URL is cache-busted with `catalog_version`/filemtime by default.

## Manual Weight Overrides (CSS)
Use CSS when a specific token should render as regular:

```css
.c-icon[data-material-symbol=":bil:"] {
  --lidingo-icon-weight: 400;
}

.acf-field-icon [data-js-acf-icon-field-item=":bil:"] {
  --lidingo-admin-icon-weight: 400;
}
```

Utility classes are also available:

```css
.lidingo-icon-bridge--regular { font-weight: 400 !important; }
.lidingo-icon-bridge--medium { font-weight: 500 !important; }
```
