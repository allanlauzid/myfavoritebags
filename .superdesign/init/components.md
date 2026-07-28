# Shared UI primitives

This is a static HTML/CSS/JavaScript site. It has no framework component library. The administrative UI is rendered from inline templates in `index.html`, `looks.html`, and `js/catalog-admin.js`.

## Admin field and button primitives

- Source: `index.html`
- Classes: `.fi`, `.fb`, `.atab`, `.apane`, `.aabtn`, `.status-cyc-btn`, `.csel-btn`
- Description: Reusable inputs, buttons, tabs, catalog actions, status controls, and custom selects.

```css
.fi {
  width:100%; border:1px solid var(--line); background:var(--bg);
  padding:10px 12px; font-family:'Jost',sans-serif; font-size:16px;
  color:var(--text); outline:none; border-radius:4px;
}
.fi:focus { border-color:var(--rose-dark); }
.fb {
  width:100%; padding:12px; background:var(--rose-dark); color:#fff;
  border:none; cursor:pointer; font-family:'Jost',sans-serif;
  font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
}
.atab {
  padding:12px 18px; border:0; border-bottom:2px solid transparent;
  background:transparent; color:var(--text-muted); cursor:pointer;
  font-family:'Jost',sans-serif; font-weight:600;
}
.atab.on { color:var(--rose-dark); border-bottom-color:var(--rose-dark); }
.apane { display:none; }
.apane.on { display:block; }
```

## Product image manager

- Source: `js/catalog-admin.js`
- Description: Shared modal used by Bags and Looks for image crop, upload, background removal, and deletion.

```html
<section class="pim-dialog" role="dialog" aria-modal="true" aria-labelledby="pimTitle">
  <header class="pim-head">
    <h2 class="pim-title" id="pimTitle">Imagem do produto</h2>
    <button type="button" class="pim-close" aria-label="Fechar">✕</button>
  </header>
  <div class="pim-stage">
    <img class="pim-image" alt="">
    <div class="pim-crop-frame"></div>
    <div class="pim-crop-grid" aria-hidden="true"></div>
  </div>
  <div class="pim-controls">
    <label class="pim-zoom"><span>Zoom</span><input type="range" min="1" max="3"></label>
    <div class="pim-actions">
      <button type="button" class="pim-btn">Editar</button>
      <button type="button" class="pim-btn remove-bg">Remover fundo</button>
      <button type="button" class="pim-btn primary">Trocar foto</button>
      <button type="button" class="pim-btn danger">Excluir foto</button>
    </div>
  </div>
</section>
```
