# Tarot artwork pipeline

The active `rws-midnight-v1` deck uses the complete traditional 1910
Rider–Waite–Smith artwork by Pamela Colman Smith. Source files come from the
public-domain Wikimedia Commons category recorded in
`assets/artwork/rws-sources.json`.

## Rebuild order

```bash
npm run import:rws
node scripts/art/build-contact-sheets.mjs
node scripts/art/finalize-manual-review.mjs
npm run verify:assets
```

`import:rws` reads the canonical 78-card order from
`src/tarot/cards/card-data.json`, downloads and verifies all Wikimedia source
records, then creates:

- Web cards at `assets/cards/{cardId}.webp` (512×768, at most 180 KB);
- MCP cards at `assets/cards/mcp/{cardId}.webp` (192×288, adaptive quality);
- versioned URLs under `/assets/cards/rws-midnight-v1/`;
- source and rights metadata in `assets/artwork/rws-sources.json`;
- the current deck manifest in `assets/cards/manifest.json`.

The complete source card is fitted without cropping. Processing only mutes the
original colours slightly and adds the project's navy and antique-gold outer
frame, so traditional symbols, titles, numbers, and ordering remain intact.

## Validation

`validate-deck.mjs` checks the 78 canonical mappings, public-domain source
metadata, hashes, dimensions, unique outputs, QA sheet hashes, size budgets,
and exact card-back symmetry. The contact sheets provide a visual check of all
cards at overview and detail sizes.

The former generated Midnight Art Nouveau sources and scripts remain in
`assets/artwork/` and `scripts/art/` as a legacy archive. They are not used by
the active deck build.
