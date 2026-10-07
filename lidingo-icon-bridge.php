<?php
/**
 * Plugin Name: Lidingo Icon Bridge
 * Description: Replaces the ACF icon picker with Lidingo ligature tokens and renders token icons in frontend.
 * Version: 0.1.1
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('LIDINGO_ICON_BRIDGE_VERSION')) {
    define('LIDINGO_ICON_BRIDGE_VERSION', '0.1.1');
}

if (!defined('LIDINGO_ICON_BRIDGE_PATH')) {
    define('LIDINGO_ICON_BRIDGE_PATH', __DIR__);
}

if (!defined('LIDINGO_ICON_BRIDGE_URL')) {
    define('LIDINGO_ICON_BRIDGE_URL', plugin_dir_url(__FILE__));
}

/**
 * Resolve a deterministic asset version.
 */
function lidingo_icon_bridge_get_asset_version(string $filePath): string
{
    if (file_exists($filePath)) {
        $mtime = filemtime($filePath);
        if (is_int($mtime)) {
            return (string) $mtime;
        }
    }

    return LIDINGO_ICON_BRIDGE_VERSION;
}

/**
 * Resolve the regular icon font URL.
 */
function lidingo_icon_bridge_get_font_regular_url(): string
{
    $default = LIDINGO_ICON_BRIDGE_URL . 'assets/fonts/lidingological-regular.woff2';
    $url = apply_filters('lidingo_icon_bridge/font_regular_url', $default);

    if (!is_string($url)) {
        $url = $default;
    }

    return esc_url_raw($url);
}

/**
 * Resolve the medium icon font URL.
 */
function lidingo_icon_bridge_get_font_medium_url(): string
{
    $default = LIDINGO_ICON_BRIDGE_URL . 'assets/fonts/lidingological-medium.woff2';
    $url = apply_filters('lidingo_icon_bridge/font_medium_url', $default);

    if (!is_string($url)) {
        $url = $default;
    }

    return esc_url_raw($url);
}

/**
 * Resolve the icon catalog URL.
 */
function lidingo_icon_bridge_get_catalog_url(): string
{
    $default = LIDINGO_ICON_BRIDGE_URL . 'assets/data/lidingo-icon-catalog.json';
    $url = apply_filters('lidingo_icon_bridge/catalog_url', $default);

    if (!is_string($url)) {
        $url = $default;
    }

    return esc_url_raw($url);
}

/**
 * Resolve a stable catalog version for cache busting.
 */
function lidingo_icon_bridge_get_catalog_version(): string
{
    $defaultPath = LIDINGO_ICON_BRIDGE_PATH . '/assets/data/lidingo-icon-catalog.json';
    $defaultVersion = lidingo_icon_bridge_get_asset_version($defaultPath);

    $version = apply_filters('lidingo_icon_bridge/catalog_version', $defaultVersion);
    if (!is_scalar($version)) {
        return $defaultVersion;
    }

    return (string) $version;
}

/**
 * Build inline @font-face rules from filtered font URLs.
 */
function lidingo_icon_bridge_get_font_face_css(): string
{
    $regular = wp_json_encode(lidingo_icon_bridge_get_font_regular_url(), JSON_UNESCAPED_SLASHES);
    $medium = wp_json_encode(lidingo_icon_bridge_get_font_medium_url(), JSON_UNESCAPED_SLASHES);

    return implode('', [
        "@font-face{font-family:'Lidingo Logical';font-style:normal;font-weight:400;font-display:swap;src:url(",
        $regular,
        ") format('woff2');}",
        "@font-face{font-family:'Lidingo Logical';font-style:normal;font-weight:500;font-display:swap;src:url(",
        $medium,
        ") format('woff2');}",
    ]);
}

/**
 * Enqueue icon bridge styles where icon rendering happens.
 */
function lidingo_icon_bridge_enqueue_styles(): void
{
    $handle = 'lidingo-icon-bridge-icons';
    $relativePath = 'assets/css/lidingo-icons.css';
    $absolutePath = LIDINGO_ICON_BRIDGE_PATH . '/' . $relativePath;

    wp_enqueue_style(
        $handle,
        LIDINGO_ICON_BRIDGE_URL . $relativePath,
        [],
        lidingo_icon_bridge_get_asset_version($absolutePath)
    );

    wp_add_inline_style($handle, lidingo_icon_bridge_get_font_face_css());
}

/**
 * Enqueue admin override that replaces the ACF icon picker behavior.
 */
function lidingo_icon_bridge_enqueue_admin_scripts(): void
{
    $handle = 'lidingo-icon-bridge-admin-picker';
    $relativePath = 'assets/js/lidingo-acf-icon-picker.js';
    $absolutePath = LIDINGO_ICON_BRIDGE_PATH . '/' . $relativePath;

    wp_enqueue_script(
        $handle,
        LIDINGO_ICON_BRIDGE_URL . $relativePath,
        [],
        lidingo_icon_bridge_get_asset_version($absolutePath),
        true
    );

    $catalogUrl = add_query_arg(
        'ver',
        rawurlencode(lidingo_icon_bridge_get_catalog_version()),
        lidingo_icon_bridge_get_catalog_url()
    );

    wp_localize_script($handle, 'lidingoIconBridge', [
        'catalogUrl' => esc_url_raw($catalogUrl),
        'maxResults' => 500,
    ]);
}

add_action('wp_enqueue_scripts', 'lidingo_icon_bridge_enqueue_styles', 110);
add_action('admin_enqueue_scripts', 'lidingo_icon_bridge_enqueue_styles', 110);
add_action('enqueue_block_editor_assets', 'lidingo_icon_bridge_enqueue_styles', 110);

add_action('admin_enqueue_scripts', 'lidingo_icon_bridge_enqueue_admin_scripts', 110);
add_action('enqueue_block_editor_assets', 'lidingo_icon_bridge_enqueue_admin_scripts', 110);

/**
 * Replace collapsible-search button icons with the Lidingo search token.
 */
function lidingo_icon_bridge_map_collapsible_search_icons_to_token($data)
{
    if (!is_array($data)) {
        return $data;
    }

    $icon = isset($data['icon']) ? (string) $data['icon'] : '';
    if ($icon !== 'search') {
        return $data;
    }

    $attributes = $data['attributeList'] ?? [];
    if (array_key_exists('data-js-collapsible-search-trigger', $attributes)
        || array_key_exists('data-js-collapsible-search-submit', $attributes)) {
        $data['icon'] = ':sök:';
        return $data;
    }

    $classList = $data['classList'] ?? null;
    if (!is_array($classList) || empty($classList)) {
        return $data;
    }

    $targetClasses = [
        'collapsible-search-form__trigger-button',
        'collapsible-search-form__submit-icon',
    ];

    foreach ($targetClasses as $targetClass) {
        if (in_array($targetClass, $classList, true)) {
            $data['icon'] = ':sök:';
            break;
        }
    }

    return $data;
}

add_filter('ComponentLibrary/Component/Button/Data', 'lidingo_icon_bridge_map_collapsible_search_icons_to_token', 20);

/**
 * Keep font ligatures available when Component Library renders Material SVGs.
 * Standard Material names and SVG icons retain their upstream rendering.
 */
function lidingo_icon_bridge_prepare_token_icon($data)
{
    if (!is_array($data)) {
        return $data;
    }

    $token = $data['icon'] ?? '';
    if (!is_string($token) || !preg_match('/^:.+:$/u', trim($token))) {
        return $data;
    }

    $data['attributeList']['data-material-symbol'] = trim($token);
    $data['decorative'] = true;

    return $data;
}

add_filter('ComponentLibrary/Component/Icon/Data', 'lidingo_icon_bridge_prepare_token_icon', 20);

/**
 * Make token-based ligature icons decorative by default.
 *
 * Prevents "Icon: Undefined" aria-labels for custom token values and avoids
 * screen readers announcing decorative glyphs.
 */
function lidingo_icon_bridge_make_token_icons_decorative($attributes)
{
    if (!is_array($attributes)) {
        return $attributes;
    }

    $token = isset($attributes['data-material-symbol']) ? (string) $attributes['data-material-symbol'] : '';
    if (!preg_match('/^:.+:$/u', trim($token))) {
        return $attributes;
    }

    $attributes['aria-hidden'] = 'true';
    $attributes['aria-label'] = '';

    return $attributes;
}

add_filter('ComponentLibrary/Component/Icon/Attribute', 'lidingo_icon_bridge_make_token_icons_decorative', 20);
