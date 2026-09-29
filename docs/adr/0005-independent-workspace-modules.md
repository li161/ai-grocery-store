# ADR 0005 — Independent workspace modules and editorial intelligence

- Status: Accepted
- Date: 2026-09-29

## Context

The original storefront was a long-scrolling landing page. That made the retail intelligence area easy to miss, forced every module to use the same card interaction, and made detailed intelligence feel like a summary rather than a browsable information product.

The reference interaction pattern is a left navigation rail with independent destinations. The retail intelligence area should behave more like an editorial product: timeline for the feed, dedicated detail view for an item, and a separate hot-ranking presentation.

## Decision

1. Use a persistent left navigation rail on desktop and a compact top rail on mobile.
2. Render one primary module at a time instead of stacking every module into one long page.
3. Keep the immersive grocery-store scene as the independent Home module.
4. Treat Retail Intelligence as a first-class information module:
   - lane filters
   - keyword search
   - chronological timeline
   - dedicated detail view
   - original-source link
5. Add Hot Rank as a separate editorial presentation with a featured story, secondary stories and a compact continuation list.
6. Add light/dark theme switching and persist the preference in localStorage.
7. Keep tools, industries, bundles and news data-driven so the UI remains extensible.
8. Preserve source URLs and dates; automatically synchronized RSS stories remain explicitly marked as auto-synced and link to the original report.

## Consequences

### Positive

- Important modules are discoverable without scrolling.
- The retail intelligence feature is a real information surface rather than a decorative shelf.
- Different modules can use different interaction patterns, reducing visual fatigue.
- New sections can be added to the navigation without redesigning the whole page.
- The data layer remains independent from presentation.

### Trade-offs

- The experience is less like a single landing page and more like a small product/workspace.
- Navigation state currently lives in Vue component state rather than a full router.
- Browser refresh returns to Home; a future iteration can promote the section state to URL routes if deep linking becomes necessary.
