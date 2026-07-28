# Theme

## Compact token summary

### Bags admin

- Primary ink: `#2A1F18`
- Body ink: `#653C2B`
- Muted: `#A08070`
- Brand rose/brown: `#8B4A3C`
- Soft rose: `#B68B73`
- Background: warm ivory `#FFFCFA`
- Soft panel: `#FAF7F4`
- Border: warm beige, token `--line`
- Success: `#1A7A3E`
- Danger: `#7A1E1E` / `#B83232`
- Coming soon: `#C97A3D`

### Looks admin

- Primary gold: `#9C7A34`
- Dark gold: `#7E5F27`
- Ink: `#111827`
- Muted: `#8C8B85`
- Background: warm off-white

### Typography and geometry

- UI font: `Jost`, sans-serif
- Display font: `Cormorant Garamond`, serif
- Admin body: 12–16px
- Panel titles: 15.5–18px, weight 700
- KPI numerals: 28px, weight 800
- Radius: 4px controls, 8–10px cards, 12–16px modals
- Icon target: 16px inline, 18–20px headings, 24–30px standalone controls
- Icon stroke target: 1.6–1.9px, rounded caps and joins

### Icon design direction

- Custom monoline icons with subtle fashion/jewelry cues.
- Bags uses warm rose-brown strokes; Looks uses antique-gold strokes.
- No emoji, platform glyph, filled app-store icon, or generic library silhouette.
- Icons must remain legible at 16px and work with `currentColor`.
- Consistent `24 × 24` viewBox and optical 2px padding.

## Raw source references

The actual theme and admin CSS are embedded in:

- `index.html:74:1750`
- `looks.html:75:1790`
- `css/admin-image-manager.css`

```css
:root {
  --modal-title:#2A1F18;
  --modal-muted:#A08070;
  --modal-error:#B83232;
  --rose-dark:#8B4A3C;
  --rose:#B68B73;
}
.admin-panel {
  background:var(--bg);
  border-radius:16px;
  box-shadow:0 24px 80px rgba(42,31,24,.32);
}
.admin-bd {
  overflow-y:auto;
  padding:clamp(1rem, 3vw, 1.75rem) clamp(1rem, 4vw, 2.4rem) clamp(1.5rem, 4vw, 2.5rem);
}
```
