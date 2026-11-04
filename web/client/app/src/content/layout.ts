/**
 * Shared layout constants.
 *
 * These encode the page shell's geometry so spacing stays consistent between
 * pages and does not drift when the header changes.
 */

/**
 * Extra scroll offset applied to in-page anchor targets so the sticky header
 * does not cover a section heading when a nav link is followed.
 *
 * Desktop is taller because the header has a second row for navigation.
 */
export const SCROLL_OFFSET = { xs: '72px', md: '136px' } as const;

/** Vertical padding for a page section. */
export const SECTION_PADDING = { xs: 6, md: 9 } as const;

/** Inner padding for an outlined panel/card. */
export const PANEL_PADDING = { xs: 3, md: 5 } as const;

/** Maximum width for long-form paragraphs, to keep line length readable. */
export const PROSE_WIDTH = 720;

/** Responsive columns for a grid of feature cards. */
export const FEATURE_COLUMNS = {
  xs: '1fr',
  sm: 'repeat(2, 1fr)',
  md: 'repeat(3, 1fr)',
} as const;

/** Responsive columns for a compact grid of short items. */
export const COMPACT_COLUMNS = {
  xs: '1fr',
  sm: 'repeat(3, 1fr)',
} as const;

/** Responsive columns for the footer's brand + link columns. */
export const FOOTER_COLUMNS = {
  xs: '1fr',
  sm: '1fr 1fr',
  md: '2fr 1fr 1fr',
} as const;

/** Gap between footer columns. */
export const FOOTER_GAP = { xs: 3, md: 6 } as const;

/** Vertical padding for the footer container. */
export const FOOTER_PADDING = { xs: 4, md: 6 } as const;

/** Maximum width for the footer's brand paragraph. */
export const FOOTER_BRAND_WIDTH = 360;
