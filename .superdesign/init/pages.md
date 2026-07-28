# Page dependency trees

## `/index.html` — Bags and central administration

Entry: `index.html`

Dependencies:
- `data/products.js`
- `js/supabase-client.js`
- `js/catalog-admin.js`
  - `css/admin-image-manager.css`
- `js/page-transition.js`
- `css/curtain-shared.css`
- `css/mobile-bottom-nav.css`
- `webp/icons/`
- `img/`

Important render branches:
- Admin shell: `index.html:2177:2197`
- Main admin content and overview: `index.html:2960:3349`
- Central panel: `index.html:3373:3430`
- Match analytics: `index.html:3437:3670`

## `/looks.html` — Looks administration

Entry: `looks.html`

Dependencies:
- `data/products-looks.js`
- `js/supabase-client.js`
- `js/catalog-admin.js`
  - `css/admin-image-manager.css`
- `js/page-transition.js`
- `css/curtain-shared.css`
- `css/mobile-bottom-nav.css`
- `webp/icons/`
- `img/`

Important render branches:
- Admin shell: `looks.html:2215:2235`
- Main admin content and overview: `looks.html:2930:3267`

## `/match.html` — public Match experience

Entry: `match.html`

Dependencies:
- `data/products.js`
- `data/products-looks.js`
- `js/supabase-client.js`
- `js/page-transition.js`
- `css/curtain-shared.css`
- `css/mobile-bottom-nav.css`
