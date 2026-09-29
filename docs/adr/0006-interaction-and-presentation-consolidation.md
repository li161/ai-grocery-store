# ADR 0006: Storefront interaction and presentation consolidation

## Context
The initial independent modules shared interaction patterns and duplicated detail-view markup. The homepage also depended on a build-time background conversion step that could overwrite the committed asset.

## Decision
- Keep one primary module visible at a time through the persistent navigation.
- Use a single reusable `ContentDetail.vue` for industry and ready-made kit details.
- Preserve retail news as a dedicated timeline/detail workflow.
- Add hash-based section state so modules are directly addressable and browser navigation remains useful.
- Add `/` to open global search and `Escape` to close active overlays.
- Commit the high-quality storefront background as a binary asset and remove the obsolete build-time conversion script.
- Keep presentation tokens centralized in `styles.css`; module-specific styles reuse the same warm wood / paper / brass palette.

## Consequences
- Fewer duplicated templates and event handlers.
- Better keyboard accessibility and direct navigation.
- Build no longer transforms or replaces a production image during CI.
- The Vue state model remains lightweight; a full router can be introduced later if module-level deep links need independent route metadata.
