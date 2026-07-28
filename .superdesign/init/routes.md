# Routes

This is a static multi-page site.

| URL | File | Administrative UI |
|---|---|---|
| `/` or `/index.html` | `index.html` | Full Bags administration, overview, central control for Looks/Match, Match analytics |
| `/looks.html` | `looks.html` | Full Looks administration and product analytics |
| `/match.html` | `match.html` | Public Match experience; analytics are surfaced from the Bags admin |

There is no router configuration. Navigation is done with normal links and JavaScript.

## Key administrative render paths

- `index.html:2177:2197` — admin overlay shell.
- `index.html:2960:3349` — login, tabs, product form, overview, click analytics.
- `index.html:3373:3430` — central control for Looks and Match.
- `index.html:3437:3670` — Match analytics modal renderer.
- `looks.html:2930:3267` — Looks admin tabs, form, overview, analytics.
- `js/catalog-admin.js:133:668` — shared categories and image manager modals.
