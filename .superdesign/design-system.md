# My Favorite Bags / Looks — Administrative Icon System

## Product context

My Favorite Bags is a refined fashion accessories catalog. The administrative panel uses warm ivory surfaces, rose-brown accents for Bags, and antique-gold accents for Looks. The interface is practical and compact but should retain the bespoke, feminine, editorial character of the public brand.

## Existing interface constraints

- Preserve all text, fields, buttons, spacing, hierarchy, and behavior.
- Preserve Jost for UI and the existing warm palette.
- Do not redesign the panel layout.
- Replace only generic emoji/Unicode glyphs with a coherent custom SVG icon family.
- Icons must use `currentColor` so the same drawing adapts to Bags rose-brown and Looks antique-gold.

## Icon family

- Canvas: `24 × 24`
- Default stroke: `1.75`
- Cap/join: rounded
- Construction: monoline outline with at most one small filled accent
- Optical character: elegant, airy, precise, friendly
- Fashion DNA: purse handle arcs, jewelry facets, stitched seams, soft heart curves, and a tiny four-point brand sparkle used sparingly
- Minimum rendered size: 16px
- Heading size: 18–20px
- No emoji, Unicode pictograms, generic Lucide/Material/Font Awesome copies, gradients, shadows, or color baked into SVG paths

## Required custom concepts

1. `ai-stylist` — generator/sparkle, combining a fine magic wand with a tiny jewelry facet.
2. `catalog-view` — eye whose pupil echoes a purse clasp.
3. `whatsapp-contact` — speech bubble with a subtle handset and stitched tail.
4. `favorite` — slender heart/star hybrid, not a generic five-point star.
5. `bag-clicks` — small handbag silhouette with a discrete click/ripple accent.
6. `looks-clicks` — jewelry ring or pendant with a discrete click/ripple accent.
7. `brand-hub` — two interlocking elegant links, one shaped like a bag handle and one like a necklace loop.
8. `match-analytics` — three rising bars capped by small match/heart facets.
9. `match-access` — doorway/eye hybrid to mean visits.
10. `match-timeline` — heart pulse line with two data nodes.
11. `user-ranking` — refined bust/medallion with a tiny laurel, replacing trophy.
12. `item-matches` — bag and pendant pairing with a small connecting heart.
13. `item-trend` — rising line chart with bag-clasp data nodes.
14. `match-inspector` — magnifier framing a paired bag/pendant mark.
15. `catalog-summary` — open archive box whose lid resembles a handbag handle.
16. `new-badge` — slim scalloped tag with one brand sparkle.
17. `confirm` — custom graceful check with a small terminal facet.
18. `warning` — rounded diamond alert, visually compatible with the family.
19. `close` — custom soft diagonal cross, same stroke and optical weight.

## Presentation requirements

Show a desktop preview of the current Bags admin overview and Match Analytics modal using the custom icons in context. Also include a labeled icon specimen strip with all 19 concepts at 24px and 16px. Keep the proposal strictly to icon replacement; the rest of the UI must match the source.
