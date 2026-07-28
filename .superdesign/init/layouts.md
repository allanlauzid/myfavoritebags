# Shared layouts

The site has no extracted layout component. Bags and Looks each contain the same administrative overlay shell inline.

## Administrative overlay shell

- Source: `index.html:2177:2197` and `looks.html:2215:2235`
- Description: Full-screen overlay with logout, title, image gallery, close action, tabs, and scrollable body.

```html
<div class="admin-ov" id="adminOv">
  <div class="admin-panel">
    <div class="admin-hd">
      <button class="admin-logout-btn" id="adminLogoutBtn" title="Sair" aria-label="Sair" style="display:none;">Sair</button>
      <span class="admin-hd-t">Painel Administrativo</span>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:14px;">
        <button class="admin-gallery-btn" id="adminGalleryBtn" title="Galeria de imagens" aria-label="Galeria de imagens" style="display:none;">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h11a2 2 0 0 1 2 2v11"/><rect x="3" y="7" width="15" height="15" rx="2.4"/><path d="M7.5 14.2c.8-1 1.6-1.6 2.4-1.6.7 0 1.2.5 1.9 1.3.9-1.4 1.7-2.1 2.6-2.1 1 0 1.8.9 3.1 2.8"/><circle cx="8.7" cy="10.8" r="1"/></svg>
        </button>
        <button class="admin-x" aria-label="Fechar painel"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
      </div>
    </div>
    <div class="admin-tabs" id="adminTabs" style="display:none;"></div>
    <div class="admin-bd" id="adminBd"></div>
  </div>
</div>
```
