# Lidingo Icon Bridge

## Purpose
This plugin replaces the default ACF icon picker (Material symbols) with Lidingo ligature tokens (for example `:blink:`), and keeps frontend icon rendering compatible with existing Municipio icon markup.

## What It Does
- Overrides `window.getAcfIcons` in admin/block editor and uses a local JSON catalog.
- Renders picker preview/list with the Lidingo icon font.
- Adds the ligature value through `ComponentLibrary/Component/Icon/Data` and renders it on `.c-icon[data-material-symbol=":token:"]::after`, including Styleguide v3's SVG-based markup.
- Marks token icons as decorative, avoiding undefined icon labels in assistive technology.
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
5. The icon data filter preserves token-formatted values in `data-material-symbol`; CSS renders the font ligature instead of requesting a Material SVG for that token.

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
- Header search trigger/submit icons use the Lidingo search ligature; both legacy classes and current `data-js-collapsible-search-*` attributes are supported.

## Source and deployment

`packages/lidingo-icon-bridge/` is the canonical local source. The copy in `wp-content/plugins/lidingo-icon-bridge/` is installed runtime output. Keep fixes in the source package and deliver the updated plugin through the deployment project's Composer/package workflow. The deployment project already requires this package in `composer.local.json`, pinned to `0.1.0`. Release the migration fix and update that pin and the local lockfile before production deployment; a local runtime sync alone does not update the Composer version.

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
