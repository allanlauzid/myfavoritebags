# Extractable components

The site is static and the shared admin is not authored as framework components. These patterns can still be treated as reusable visual components.

## AdminOverlay
- Source: `index.html:2177:2197`
- Category: layout
- Description: Full-screen administrative panel with header, tabs, and scroll body.
- Extractable props: `title`, `activeTab`, `showGallery`, `showLogout`
- Hardcoded: logo language, header geometry, warm palette, close/gallery icon style

## AdminTabs
- Source: `index.html:2990:3015`
- Category: basic
- Description: Horizontally scrollable administration tabs.
- Extractable props: `activeTab`
- Hardcoded: tab labels and admin typography

## OverviewMetricCard
- Source: `index.html:3287:3308`
- Category: basic
- Description: Compact KPI card used for total, availability, status, and favorites.
- Extractable props: `value`, `label`, `tone`
- Hardcoded: card spacing and typography

## AnalyticsSection
- Source: `index.html:3315:3340`
- Category: basic
- Description: Analytics card with icon title, period filters, and data body.
- Extractable props: `title`, `activePeriod`
- Hardcoded: panel geometry and brand coloring

## PersonalizedAdminIcon
- Source: new design proposal only; not implemented
- Category: basic
- Description: Shared 24×24 monoline icon family for all current emoji/Unicode admin symbols.
- Extractable props: `name`, `size`, `tone`
- Hardcoded: rounded stroke language, fashion-specific micro-details, 24×24 viewBox
