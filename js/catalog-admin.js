// ═══════════════════════════════════════════════════════════════════════════
// CATÁLOGO / ADMIN — lógica compartilhada entre index.html (Bags) e looks.html
// (Looks). Cada página continua definindo sua própria `CATS_LIST` (categorias
// padrão) e `lastCatFilter` antes deste script rodar; as funções aqui só leem
// essas variáveis globais na hora de serem chamadas, então a ordem de
// declaração não importa.
//
// Cores de modal usadas aqui vêm de variáveis CSS definidas no :root de cada
// página (com fallback para as cores que já eram usadas no My Favorite Bags):
//   --modal-backdrop-rgb   fundo escurecido atrás do modal, em "r,g,b"
//   --modal-title          cor do título dentro do modal
//   --modal-muted          cor do texto secundário dentro do modal
//   --modal-error          cor de mensagens de erro/exclusão
// ═══════════════════════════════════════════════════════════════════════════

// ─── STATUS DO CATÁLOGO (Disponível / Esgotado / Em Breve / Oculto) ─────────
const STATUS_LABEL = { available:'DISPONÍVEL', sold_out:'ESGOTADO', coming_soon:'EM BREVE', hidden:'OCULTO' };
const STATUS_BADGE = { available:'Disponível', sold_out:'Esgotado', coming_soon:'Em Breve', hidden:'Oculto' };
function nextStatus(st) {
  return st === 'available' ? 'sold_out' : st === 'sold_out' ? 'coming_soon' : st === 'coming_soon' ? 'hidden' : 'available';
}

// ─── CATEGORIAS (editáveis pelo admin) ──────────────────────────────────────
function catLabel(key) {
  const c = CATS_LIST.find(c => c.key === key);
  return c ? c.label : (key || '—');
}
function slugifyCat(name) {
  let base = name.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) base = 'cat';
  let slug = base, n = 2;
  while (CATS_LIST.some(c => c.key === slug)) { slug = `${base}-${n++}`; }
  return slug;
}
// Compat: código antigo que ainda referenciar CATS[x] continua funcionando
const CATS = new Proxy({}, { get: (_, key) => catLabel(key) });

function renderCatFilters() {
  const wrap = document.getElementById('catFilters');
  if (!wrap) return;
  if (!CATS_LIST.some(c => c.key === lastCatFilter)) lastCatFilter = 'all';
  wrap.innerHTML = `<button class="fpill${lastCatFilter==='all'?' on':''}" aria-pressed="${lastCatFilter==='all'}" onclick="fp('all',this)">Todas</button>` +
    CATS_LIST.map(c => `<button class="fpill cat-tip${lastCatFilter===c.key?' on':''}" aria-pressed="${lastCatFilter===c.key}" data-desc="${(c.desc||'').replace(/"/g,'&quot;')}" onclick="fp('${c.key}',this);showCatTip(this)">${c.label}</button>`).join('');
  renderProducts(lastCatFilter);
}

// Mostra a legenda da categoria ao passar o mouse (CSS) ou ao clicar (toque) —
// no clique, o botão já filtra normalmente; a legenda só aparece por cima por
// um instante, sem interferir no filtro.
let _catTipTimer = null;
function showCatTip(btn) {
  document.querySelectorAll('.cat-tip.show-tip').forEach(b => b.classList.remove('show-tip'));
  if (!btn.dataset.desc) return;
  btn.classList.add('show-tip');
  clearTimeout(_catTipTimer);
  _catTipTimer = setTimeout(() => btn.classList.remove('show-tip'), 2600);
}
function renderCatSelect() {
  const sel = document.getElementById('nc');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = CATS_LIST.map(c => `<option value="${c.key}">${c.label}</option>`).join('');
  if (CATS_LIST.some(c => c.key === cur)) sel.value = cur;
  // Mantém o rótulo do botão customizado (substitui o <select> nativo) em dia
  const btnLabel = document.getElementById('ncBtnLabel');
  if (btnLabel) {
    const opt = sel.options[sel.selectedIndex];
    btnLabel.textContent = opt ? opt.textContent : 'Selecione';
  }
}

// ─── DROPDOWN CUSTOMIZADO DE CATEGORIA ──────────────────────────────────────
// Substitui o <select> nativo nas categorias (Adicionar Peça/Bolsa e
// Gerenciar Catálogo) para permitir estilizar o hover das opções — algo que
// o dropdown nativo do navegador não permite via CSS.
let _catPopupEl = null;

function closeCatPopup() {
  if (_catPopupEl) { _catPopupEl.remove(); _catPopupEl = null; }
  document.removeEventListener('mousedown', _catPopupOutsideHandler, true);
  window.removeEventListener('scroll', closeCatPopup, true);
  window.removeEventListener('resize', closeCatPopup);
  document.querySelectorAll('.csel-trigger.open').forEach(b => b.classList.remove('open'));
}
function _catPopupOutsideHandler(e) {
  if (_catPopupEl && !_catPopupEl.contains(e.target) && !e.target.closest('.csel-trigger')) {
    closeCatPopup();
  }
}
// Popup genérico: options = [{value, label}, ...]
function openSelectPopup(triggerBtn, options, currentValue, onPick) {
  const alreadyOpenForThis = _catPopupEl && triggerBtn.classList.contains('open');
  closeCatPopup();
  if (alreadyOpenForThis) return; // clique no próprio botão fecha o popup

  const r = triggerBtn.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'csel-popup';
  pop.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;width:${Math.max(r.width, 110)}px;z-index:9600;`;
  pop.innerHTML = options.map(o => `
    <div class="csel-opt${o.value === currentValue ? ' sel' : ''}" data-value="${o.value}">${o.label}</div>
  `).join('') || `<div class="csel-opt" style="cursor:default;">Sem opções</div>`;
  document.body.appendChild(pop);

  // Se o popup ultrapassar a borda inferior da tela, abre para cima do botão
  const popR = pop.getBoundingClientRect();
  if (popR.bottom > window.innerHeight - 8) {
    pop.style.top = (r.top - popR.height - 4) + 'px';
  }

  pop.querySelectorAll('.csel-opt[data-value]').forEach(opt => {
    opt.addEventListener('click', () => {
      onPick(opt.dataset.value);
      closeCatPopup();
    });
  });
  triggerBtn.classList.add('open');
  _catPopupEl = pop;
  setTimeout(() => {
    document.addEventListener('mousedown', _catPopupOutsideHandler, true);
    window.addEventListener('scroll', closeCatPopup, true);
    window.addEventListener('resize', closeCatPopup);
  }, 0);
}

// Atalho específico para categorias (usa CATS_LIST)
function openCatPopup(triggerBtn, currentKey, onPick) {
  openSelectPopup(triggerBtn, CATS_LIST.map(c => ({ value: c.key, label: c.label })), currentKey, onPick);
}

// ─── MODAIS DE CATEGORIA (Nova / Editar) ────────────────────────────────────
function openNewCategoryModal() {
  const wrap = document.createElement('div');
  wrap.id = 'catModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(var(--modal-backdrop-rgb),.65);display:flex;align-items:center;justify-content:center;';
  wrap.innerHTML = `
    <div style="background:var(--bg);border-radius:12px;padding:28px 32px;max-width:360px;width:92%;font-family:'Jost',sans-serif;">
      <p style="font-size:14px;font-weight:700;color:var(--modal-title);margin-bottom:4px;">Nova Categoria</p>
      <p style="font-size:12px;color:var(--modal-muted);margin-bottom:18px;">Digite o nome da nova categoria.</p>
      <input class="fi" id="newCatName" placeholder="Ex: Nova categoria" style="margin-bottom:14px;">
      <p id="newCatErr" style="font-size:12px;color:var(--modal-error);margin-bottom:10px;display:none;"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('catModal').remove()" style="padding:10px 20px;border:1px solid var(--line);background:none;cursor:pointer;font-size:12px;color:var(--modal-muted);">Cancelar</button>
        <button onclick="saveNewCategory()" style="padding:10px 20px;border:none;background:var(--rose-dark);color:#fff;cursor:pointer;font-size:12px;font-weight:700;border-radius:6px;">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('newCatName').focus();
}
function saveNewCategory() {
  const input = document.getElementById('newCatName');
  const name = input.value.trim();
  const err = document.getElementById('newCatErr');
  if (!name) { err.textContent = 'Digite um nome para a categoria.'; err.style.display = 'block'; return; }
  if (CATS_LIST.some(c => c.label.toLowerCase() === name.toLowerCase())) {
    err.textContent = 'Já existe uma categoria com esse nome.'; err.style.display = 'block'; return;
  }
  CATS_LIST.push({ key: slugifyCat(name), label: name });
  markDirty();
  renderCatSelect();
  if (typeof renderCrudNewCatSelect === 'function') renderCrudNewCatSelect();
  renderCatFilters();
  const m = document.getElementById('catModal'); if (m) m.remove();
}

function openEditCategoryModal() {
  const wrap = document.createElement('div');
  wrap.id = 'catModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(var(--modal-backdrop-rgb),.65);display:flex;align-items:center;justify-content:center;';
  wrap.innerHTML = `
    <div style="background:var(--bg);border-radius:12px;padding:28px 32px;max-width:420px;width:92%;max-height:80vh;overflow-y:auto;font-family:'Jost',sans-serif;">
      <p style="font-size:14px;font-weight:700;color:var(--modal-title);margin-bottom:4px;">Editar Categorias</p>
      <p style="font-size:12px;color:var(--modal-muted);margin-bottom:18px;">Renomeie ou exclua uma categoria existente.</p>
      <div id="editCatList"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button onclick="document.getElementById('catModal').remove()" style="padding:10px 20px;border:1px solid var(--line);background:none;cursor:pointer;font-size:12px;color:var(--modal-muted);">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  renderEditCategoryList();
}
function renderEditCategoryList() {
  const box = document.getElementById('editCatList');
  if (!box) return;
  // Categoria reservada (NO_CATEGORY_KEY, ex: "(Sem categoria)" em bags) não
  // pode ser excluída — é usada pelo catálogo público pra separar itens sem
  // categoria; só existe em páginas que a definem (Looks não tem essa regra).
  box.innerHTML = CATS_LIST.map(c => {
    const isProtected = typeof NO_CATEGORY_KEY !== 'undefined' && c.key === NO_CATEGORY_KEY;
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);">
      <input class="fi" id="editCatName-${c.key}" value="${c.label}" style="flex:1;" ${isProtected ? 'disabled' : ''}>
      <button onclick="saveCategoryRename('${c.key}')" title="Salvar novo nome" ${isProtected ? 'disabled' : ''}
        style="padding:9px 12px;border:1px solid var(--rose-dark);background:transparent;color:var(--rose-dark);cursor:pointer;font-size:12px;border-radius:4px;${isProtected ? 'opacity:.4;cursor:not-allowed;' : ''}">Salvar</button>
      <button onclick="deleteCategory('${c.key}')" title="${isProtected ? 'Categoria padrão — não pode ser excluída' : 'Excluir categoria'}" ${isProtected ? 'disabled' : ''}
        style="padding:9px 12px;border:1px solid #b83232;background:transparent;color:#b83232;cursor:pointer;font-size:12px;border-radius:4px;${isProtected ? 'opacity:.4;cursor:not-allowed;' : ''}">Excluir</button>
    </div>`;
  }).join('') || `<p style="font-size:12px;color:var(--modal-muted);">Nenhuma categoria cadastrada.</p>`;
}
function saveCategoryRename(key) {
  if (typeof NO_CATEGORY_KEY !== 'undefined' && key === NO_CATEGORY_KEY) return;
  const input = document.getElementById(`editCatName-${key}`);
  const name = input.value.trim();
  if (!name) return;
  const c = CATS_LIST.find(c => c.key === key);
  if (!c) return;
  c.label = name;
  markDirty();
  renderCatSelect();
  if (typeof renderCrudNewCatSelect === 'function') renderCrudNewCatSelect();
  renderCatFilters();
  renderAdminList();
  renderProducts(lastCatFilter);
}
function deleteCategory(key) {
  if (typeof NO_CATEGORY_KEY !== 'undefined' && key === NO_CATEGORY_KEY) {
    alert('Essa é uma categoria padrão do catálogo e não pode ser excluída.');
    return;
  }
  const c = CATS_LIST.find(c => c.key === key);
  if (!c) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(var(--modal-backdrop-rgb),.7);display:flex;align-items:center;justify-content:center;';
  wrap.innerHTML = `<div style="background:#fff;border-radius:12px;padding:28px 32px;max-width:340px;text-align:center;">
    <p style="font-size:14px;font-weight:700;color:var(--modal-title);margin-bottom:6px;">Excluir categoria "${c.label}"?</p>
    <p style="font-size:12px;color:var(--modal-muted);margin-bottom:22px;">A categoria some da lista e do site. Os itens cadastrados nela permanecem no catálogo.</p>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="catDelNo"  style="padding:10px 22px;border:1px solid #D4C5BA;border-radius:8px;background:none;cursor:pointer;font-size:12px;">Não, cancelar</button>
      <button id="catDelYes" style="padding:10px 22px;border:none;border-radius:8px;background:#b83232;color:#fff;cursor:pointer;font-size:12px;font-weight:700;">Sim, excluir</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#catDelNo').onclick  = () => wrap.remove();
  wrap.querySelector('#catDelYes').onclick = () => {
    wrap.remove();
    CATS_LIST = CATS_LIST.filter(c => c.key !== key);
    markDirty();
    renderCatSelect();
    if (typeof renderCrudNewCatSelect === 'function') renderCrudNewCatSelect();
    renderCatFilters();
    renderEditCategoryList();
    renderAdminList();
    renderProducts(lastCatFilter);
  };
}

// ─── HISTÓRICO DE EXCLUÍDOS ───────────────────────────────────────────────────
function openDeletedHistoryModal() {
  const wrap = document.createElement('div');
  wrap.id = 'deletedHistoryModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(var(--modal-backdrop-rgb),.65);display:flex;align-items:center;justify-content:center;';
  wrap.innerHTML = `
    <div style="background:var(--bg);border-radius:12px;padding:28px 32px;max-width:540px;width:92%;max-height:80vh;display:flex;flex-direction:column;font-family:'Jost',sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
        <div>
          <p style="font-size:16px;font-weight:700;color:var(--modal-title);margin-bottom:4px;">Histórico Excluído</p>
          <p style="font-size:13px;color:var(--modal-muted);">Itens removidos do catálogo. Você pode recriá-los com um novo SKU.</p>
        </div>
        <button onclick="document.getElementById('deletedHistoryModal').remove()" style="background:none;border:none;cursor:pointer;color:var(--modal-muted);font-size:20px;line-height:1;">&times;</button>
      </div>
      <div id="deletedHistoryList" style="flex:1;overflow-y:auto;padding-right:8px;display:flex;flex-direction:column;gap:12px;"></div>
    </div>`;
  document.body.appendChild(wrap);
  renderDeletedHistoryList();
}

function renderDeletedHistoryList() {
  const box = document.getElementById('deletedHistoryList');
  if (!box) return;
  const deletedItems = products.filter(p => p.status === 'deleted');
  if (deletedItems.length === 0) {
    box.innerHTML = `<p style="font-size:13px;color:var(--modal-muted);text-align:center;padding:20px 0;">Nenhum item excluído encontrado.</p>`;
    return;
  }
  
  box.innerHTML = deletedItems.map(p => {
    return `
      <div style="display:flex;align-items:center;gap:16px;background:var(--white);padding:12px;border-radius:8px;border:1px solid var(--line);">
        <div style="width:48px;height:64px;border-radius:4px;background:#F2ECE6;overflow:hidden;flex-shrink:0;">
          ${p.img ? `<img src="${p.img}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <p style="font-size:12px;font-weight:600;color:var(--rose-dark);letter-spacing:0.05em;margin-bottom:2px;">${p.sku || `ID-${p.id}`}</p>
          <p style="font-size:14px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;">${p.name}</p>
          <p style="font-size:12px;color:var(--text-muted);"><span class="deleted-size-placeholder" data-url="${p.img || ''}">Tamanho: calculando...</span></p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          <button disabled style="padding:6px 12px;border:1px solid var(--line);background:#f5f5f5;color:#aaa;cursor:not-allowed;font-size:11px;border-radius:4px;">Restaurar</button>
          <button onclick="cloneDeletedProduct(${p.id})" style="padding:6px 12px;border:1px solid var(--rose-dark);background:transparent;color:var(--rose-dark);cursor:pointer;font-size:11px;border-radius:4px;font-weight:600;">Clonar Imagem</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Asynchronously fetch sizes
  box.querySelectorAll('.deleted-size-placeholder').forEach(el => {
    const url = el.getAttribute('data-url');
    if (!url || !url.startsWith('http')) {
      el.textContent = 'Tamanho: Indisponível';
      return;
    }
    fetch(url, { method: 'HEAD' })
      .then(r => {
        const size = r.headers.get('content-length');
        if (size) {
          const kb = (parseInt(size, 10) / 1024).toFixed(1);
          el.textContent = `Tamanho: ${kb} KB`;
        } else {
          el.textContent = 'Tamanho: Indisponível';
        }
      })
      .catch(() => el.textContent = 'Tamanho: Indisponível');
  });
}

function cloneDeletedProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  
  const isBags = window.location.pathname.includes('index.html') || !window.location.pathname.includes('looks.html');
  document.getElementById('deletedHistoryModal').remove();
  
  if (isBags) {
    document.getElementById('crudNewName').value = p.name + ' (Clonado - Alterar)';
    document.getElementById('crudNewPrice').value = p.price;
    document.getElementById('crudNewDesc').value = ''; // A descrição deve ser diferente
    document.getElementById('crudNewCat').value = p.cat;
    renderCrudNewCatSelect();
    
    // Set up image
    const preview = document.getElementById('crudNewPreview');
    preview.src = p.img;
    preview.style.display = 'block';
    crudNewImageSource = p.img;
    document.getElementById('crudUploadText').textContent = 'Trocar imagem';
    document.getElementById('crudRemoveBg').disabled = false;
    
    document.getElementById('crudNewName').focus();
    showToast('Imagem clonada. Você DEVE alterar o nome e a descrição para publicar.');
  } else {
    // looks.html
    document.getElementById('nn').value = p.name + ' (Clonado - Alterar)';
    document.getElementById('np').value = p.price;
    document.getElementById('nc').value = p.cat;
    
    const photoImg = document.getElementById('npPhotoImg');
    photoImg.src = p.img;
    newProdFinalImg = p.img;
    newProdFileName = 'clonado.webp';
    _npShow('npPhotoFilled');
    
    document.getElementById('nn').focus();
    showToast('Imagem clonada. Você DEVE alterar o nome da peça para publicar.');
  }
}

// ─── GERENCIADOR DE IMAGEM DO CATÁLOGO ──────────────────────────────────────
// Compartilhado entre Bags e Looks. Permite visualizar, trocar, excluir e
// recortar em formato quadrado a imagem que aparece nos cards do catálogo.
let _pimState = null;
let _catalogEditSnapshot = null;
const _pendingCatalogImages = new Map();

function _catalogClone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function beginCatalogEditSession() {
  if (typeof products === 'undefined' || _catalogEditSnapshot) return;
  _catalogEditSnapshot = _catalogClone(products);
}

function discardCatalogEditSession() {
  if (_catalogEditSnapshot && typeof products !== 'undefined') {
    products.splice(0, products.length, ..._catalogClone(_catalogEditSnapshot));
  }
  _pendingCatalogImages.clear();
  _catalogEditSnapshot = null;
  if (typeof renderProducts === 'function') renderProducts('all');
  if (typeof renderFavCarousel === 'function') renderFavCarousel();
  if (typeof renderOverviewTab === 'function') renderOverviewTab();
  if (typeof renderCrudBags === 'function') renderCrudBags();
}

function commitCatalogEditSession() {
_pendingCatalogImages.clear();
  _catalogEditSnapshot = null;
}

function generateNextSku(prefix, productsList) {
  let maxNum = 0;
  for (const p of productsList) {
    if (p.sku && p.sku.startsWith(prefix)) {
      const numStr = p.sku.replace(prefix, '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

function migrateMissingSkus() {
  if (typeof products === 'undefined' || !Array.isArray(products)) return;
  const isBags = window.location.pathname.includes('index.html') || !window.location.pathname.includes('looks.html');
  const prefix = isBags ? '#MFB-' : '#MFL-';
  
  let changed = false;
  // Sort temporally to give oldest items the lowest SKU
  const sorted = [...products].sort((a,b) => a.id - b.id);
  
  sorted.forEach(p => {
    if (!p.sku) {
      p.sku = generateNextSku(prefix, products);
      changed = true;
    }
  });
  
  if (changed) {
    if (typeof markDirty === 'function') markDirty();
    if (typeof renderAdminList === 'function') renderAdminList();
    showToast('Migração de SKUs concluída automaticamente. Clique em "Revisar e Salvar" para publicar no banco.');
  }
}

setTimeout(migrateMissingSkus, 2000);

function stageCatalogProductImage(product, dataUrl, filename, originalName) {
  const current = _pendingCatalogImages.get(product.id) || {};
  const isHttp = typeof dataUrl === 'string' && dataUrl.startsWith('http');
  _pendingCatalogImages.set(product.id, {
    dataUrl,
    filename: filename || current.filename || null,
    originalName: originalName || current.originalName || 'foto',
    uploadedUrl: isHttp ? dataUrl : null,
  });
  product.img = dataUrl || '';
  // A imagem mudou (ou foi removida) — o srcset antigo não corresponde mais a
  // este arquivo. Fica vazio até finalizePendingProductImages() gerar/subir
  // as novas variantes e preencher de novo.
  product.imgSrcset = '';
}

// Retorna usos da imagem no catálogo carregado no navegador (incluindo rascunhos)
function getLocalImageUsages(imageName) {
  const usages = [];
  if (typeof products !== 'undefined' && Array.isArray(products)) {
    const tableStr = window.location.pathname.includes('looks') ? 'looks' : 'bags';
    for (const p of products) {
      let isUsed = false;
      const pending = _pendingCatalogImages.get(p.id);
      if (pending && pending.dataUrl) {
        if (pending.dataUrl.includes(imageName)) isUsed = true;
      } else {
        if (p.img && p.img.includes(imageName)) isUsed = true;
        if (p.img_srcset && p.img_srcset.includes(imageName)) isUsed = true;
        if (p.images && p.images.some(img => img.includes(imageName))) isUsed = true;
      }
      if (isUsed) {
        usages.push({ name: p.name, table: tableStr });
      }
    }
  }
  return usages;
}

function slugifyName(name) {
  return (name || 'sem-nome').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function finalizePendingProductImages() {
  for (const [id, pending] of _pendingCatalogImages.entries()) {
    const product = _pimProduct(id);
    if (!product || !pending.dataUrl) continue;
    if (!pending.uploadedUrl) {
      // Definir nome do arquivo com SKU se disponível: [SKU]_[nome]_[original].webp
      let finalFilename = pending.filename;
      if (!finalFilename) {
        const skuStr = product.sku ? product.sku.replace('#', '') : `ID-${product.id}`;
        const nameSlug = slugifyName(product.name);
        const origSlug = slugifyName(pending.originalName);
        finalFilename = `${skuStr}_${nameSlug}_${origSlug}.webp`;
      }
      // Sobe a imagem original + (melhor esforço) versões redimensionadas
      // reais pro srcset do card no catálogo público. Se a geração/upload das
      // variantes falhar por qualquer motivo, cai de volta pra imagem única.
      const result = await sbUploadImageResponsive(pending.dataUrl, finalFilename);
      pending.uploadedUrl = result.url;
      pending.srcset = result.srcset;
    }
    product.img = pending.uploadedUrl;
    product.imgSrcset = pending.srcset || '';
  }
}

function toggleCatalogRowActions(button) {
  const row = button.closest('.admin-catalog-row');
  if (!row) return;
  const open = row.classList.toggle('actions-open');
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Ocultar ações' : 'Mais ações';
}

function _pimEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[char]);
}

function _pimProduct(id) {
  return typeof products !== 'undefined' && Array.isArray(products)
    ? products.find(item => item.id === id)
    : null;
}

function _pimSetStatus(message, isError = false) {
  const status = document.getElementById('pimStatus');
  if (!status) return;
  status.textContent = message || '';
  status.style.color = isError ? 'var(--modal-error)' : 'var(--text-muted)';
}

function _pimSetBusy(busy) {
  const dialog = document.querySelector('.pim-dialog');
  if (!dialog) return;
  dialog.querySelectorAll('button, input').forEach(control => {
    control.disabled = busy;
  });
  dialog.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function _pimRefreshCatalog() {
  if (typeof markDirty === 'function') markDirty();
  if (typeof renderProducts === 'function') {
    renderProducts(typeof lastCatFilter !== 'undefined' ? lastCatFilter : 'all');
  }
  if (typeof renderFavCarousel === 'function') renderFavCarousel();
  if (typeof renderOverviewTab === 'function') renderOverviewTab();
}

function _pimRenderImage() {
  if (!_pimState) return;
  const product = _pimProduct(_pimState.id);
  const image = document.getElementById('pimImage');
  const empty = document.getElementById('pimEmpty');
  const edit = document.getElementById('pimEdit');
  const remove = document.getElementById('pimDelete');
  const removeBg = document.getElementById('pimRemoveBg');
  if (!product || !image || !empty) return;

  const hasImage = Boolean(product.img);
  image.style.display = hasImage ? 'block' : 'none';
  empty.classList.toggle('show', !hasImage);
  edit.disabled = !hasImage;
  remove.disabled = !hasImage;
  if (removeBg) removeBg.disabled = !hasImage;
  image.className = 'pim-image';
  image.style.cssText = '';
  image.draggable = false;
  if (hasImage) {
    image.crossOrigin = 'anonymous';
    image.src = product.img;
    image.alt = `Imagem de ${product.name}`;
  } else {
    image.removeAttribute('src');
    image.alt = '';
  }
}

function openProductImageManager(id) {
  const product = _pimProduct(id);
  if (!product) return;
  closeProductImageManager(true);

  const overlay = document.createElement('div');
  overlay.id = 'productImageManager';
  overlay.className = 'pim-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `
    <section class="pim-dialog" role="dialog" aria-modal="true" aria-labelledby="pimTitle">
      <header class="pim-head">
        <h2 class="pim-title" id="pimTitle">Imagem de ${_pimEscape(product.name)}</h2>
        <button type="button" class="pim-close" onclick="closeProductImageManager()" aria-label="Fechar">✕</button>
      </header>
      <div class="pim-stage" id="pimStage">
        <img class="pim-image" id="pimImage" alt="">
        <div class="pim-empty" id="pimEmpty">Este item está sem imagem. Use “Fazer upload” para adicionar uma foto.</div>
        <div class="pim-crop-grid" aria-hidden="true"></div>
      </div>
      <div class="pim-controls">
        <label class="pim-zoom" id="pimZoomWrap" for="pimZoom">
          <span>Zoom</span>
          <input id="pimZoom" type="range" min="1" max="3" value="1" step="0.01" aria-label="Zoom do recorte">
        </label>
        <div class="pim-actions" id="pimMainActions">
          <button type="button" class="pim-btn" id="pimEdit" onclick="startProductImageCrop()">Editar</button>
          <button type="button" class="pim-btn remove-bg" id="pimRemoveBg" onclick="removeProductImageBackground()">Remover fundo</button>
          <button type="button" class="pim-btn danger" id="pimDelete" onclick="openProductImageDeleteConfirm(this)">Excluir</button>
          <button type="button" class="pim-btn primary" onclick="document.getElementById('pimUpload').click()">Fazer upload</button>
        </div>
        <div class="pim-actions crop-actions" id="pimCropActions" hidden>
          <button type="button" class="pim-btn" onclick="cancelProductImageCrop()">Cancelar</button>
          <button type="button" class="pim-btn primary" onclick="saveProductImageCrop()">Salvar recorte</button>
        </div>
        <input id="pimUpload" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        <p class="pim-status" id="pimStatus" role="status" aria-live="polite"></p>
      </div>
    </section>`;

  document.body.appendChild(overlay);
  _pimState = { id, crop:false, zoom:1, x:0, y:0, pointerId:null, lastX:0, lastY:0, keyHandler:null };
  _pimRenderImage();

  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) closeProductImageManager();
  });
  document.getElementById('pimUpload').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (file) uploadProductImage(file);
    event.target.value = '';
  });
  _pimState.keyHandler = event => {
    if (event.key === 'Escape') {
      if (_pimState && _pimState.crop) cancelProductImageCrop();
      else closeProductImageManager();
    }
  };
  document.addEventListener('keydown', _pimState.keyHandler);
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    overlay.querySelector('.pim-close').focus();
  });
}

function closeProductImageManager(immediate = false) {
  const overlay = document.getElementById('productImageManager');
  if (_pimState && _pimState.keyHandler) document.removeEventListener('keydown', _pimState.keyHandler);
  _pimState = null;
  if (!overlay) return;
  overlay.classList.remove('open');
  if (immediate) overlay.remove();
  else setTimeout(() => overlay.remove(), 180);
}

async function uploadProductImage(file, isRemoveBg = false) {
  if (!_pimState) return;
  const product = _pimProduct(_pimState.id);
  if (!product) return;
  _pimSetBusy(true);
  _pimSetStatus('Preparando a nova imagem…');
  try {
    let webp;
    if (isRemoveBg) {
      webp = await sbRemoveBackground(file);
      const originalName = file.name ? file.name.replace(/\.[^/.]+$/, "") + "-nobg" : "sem-fundo";
      stageCatalogProductImage(product, webp, null, originalName);
    } else {
      webp = await convertToWebp(file, .9);
      const originalName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "foto";
      stageCatalogProductImage(product, webp, null, originalName);
    }
    _pimRefreshCatalog();
    _pimRenderImage();
    _pimSetStatus('Nova imagem pronta. Ela será enviada somente ao confirmar e salvar o painel.');
  } catch (error) {
    _pimSetStatus(`Não foi possível enviar a imagem: ${error.message}`, true);
  } finally {
    _pimSetBusy(false);
  }
}

async function removeProductImageBackground() {
  if (!_pimState) return;
  const product = _pimProduct(_pimState.id);
  if (!product || !product.img) return;
  _pimSetBusy(true);
  _pimSetStatus('Removendo o fundo da imagem…');
  try {
    const response = await fetch(product.img);
    if (!response.ok) throw new Error('Não foi possível carregar a imagem atual.');
    const blob = await response.blob();
    const file = new File([blob], `bolsa-${product.id}.${blob.type.includes('png') ? 'png' : 'webp'}`, { type:blob.type || 'image/webp' });
    const removed = await sbRemoveBackground(file);
    const webp = await convertToWebp(removed, .9);
    stageCatalogProductImage(product, webp, `catalogo-${product.id}-sem-fundo-${Date.now()}.webp`);
    _pimRefreshCatalog();
    _pimRenderImage();
    _pimSetStatus('Fundo removido. Revise a imagem e confirme o salvamento do painel.');
  } catch (error) {
    _pimSetStatus(`Não foi possível remover o fundo: ${error.message}`, true);
  } finally {
    _pimSetBusy(false);
  }
}

function openProductImageDeleteConfirm(trigger) {
  if (!_pimState) return;
  const product = _pimProduct(_pimState.id);
  if (!product || !product.img) return;
  const wrap = document.createElement('div');
  wrap.id = 'pimDeleteConfirm';
  wrap.className = 'pim-confirm-overlay';
  wrap.innerHTML = `
    <section class="pim-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pimConfirmTitle" aria-describedby="pimConfirmText">
      <h3 id="pimConfirmTitle">Excluir esta imagem?</h3>
      <p id="pimConfirmText">“${_pimEscape(product.name)}” continuará no catálogo, mas ficará sem foto.</p>
      <div class="pim-confirm-actions">
        <button type="button" class="pim-btn" id="pimConfirmCancel">Cancelar</button>
        <button type="button" class="pim-btn danger" id="pimConfirmDelete">Excluir imagem</button>
      </div>
    </section>`;
  document.body.appendChild(wrap);
  const cancel = wrap.querySelector('#pimConfirmCancel');
  const confirm = wrap.querySelector('#pimConfirmDelete');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    wrap.remove();
    if (trigger) trigger.focus();
  };
  const onKey = event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const target = document.activeElement === confirm && !event.shiftKey ? cancel : confirm;
      event.preventDefault(); target.focus();
    }
  };
  cancel.onclick = close;
  confirm.onclick = () => { close(); deleteProductImage(); };
  wrap.addEventListener('mousedown', event => { if (event.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  cancel.focus();
}

function deleteProductImage() {
  if (!_pimState) return;
  const product = _pimProduct(_pimState.id);
  if (!product || !product.img) return;
  stageCatalogProductImage(product, null);
  product.img = '';
  product.imgSrcset = '';
  _pimRefreshCatalog();
  _pimRenderImage();
  _pimSetStatus('Imagem removida da prévia. A exclusão será confirmada ao salvar o painel.');
}

function _pimClampCrop() {
  if (!_pimState || !_pimState.crop) return;
  const stage = document.getElementById('pimStage');
  const image = document.getElementById('pimImage');
  const size = stage.clientWidth;
  const base = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const total = base * _pimState.zoom;
  const maxX = Math.max(0, (image.naturalWidth * total - size) / 2);
  const maxY = Math.max(0, (image.naturalHeight * total - size) / 2);
  _pimState.x = Math.max(-maxX, Math.min(maxX, _pimState.x));
  _pimState.y = Math.max(-maxY, Math.min(maxY, _pimState.y));
  image.style.left = '50%';
  image.style.top = '50%';
  image.style.width = `${image.naturalWidth}px`;
  image.style.height = `${image.naturalHeight}px`;
  image.style.transform = `translate(calc(-50% + ${_pimState.x}px), calc(-50% + ${_pimState.y}px)) scale(${total})`;
}

function startProductImageCrop() {
  if (!_pimState) return;
  const image = document.getElementById('pimImage');
  if (!image || !image.src) return;
  const begin = () => {
    _pimState.crop = true;
    _pimState.zoom = 1;
    _pimState.x = 0;
    _pimState.y = 0;
    document.getElementById('pimStage').classList.add('cropping');
    document.getElementById('pimZoomWrap').classList.add('show');
    document.getElementById('pimMainActions').hidden = true;
    document.getElementById('pimCropActions').hidden = false;
    const zoom = document.getElementById('pimZoom');
    zoom.value = '1';
    zoom.oninput = () => {
      _pimState.zoom = Number(zoom.value);
      _pimClampCrop();
    };
    _pimClampCrop();
    _pimSetStatus('Arraste a imagem e ajuste o zoom para definir o recorte quadrado.');
  };
  if (image.complete && image.naturalWidth) begin();
  else image.addEventListener('load', begin, { once:true });
}

function cancelProductImageCrop() {
  if (!_pimState) return;
  _pimState.crop = false;
  const stage = document.getElementById('pimStage');
  const image = document.getElementById('pimImage');
  stage.classList.remove('cropping');
  document.getElementById('pimZoomWrap').classList.remove('show');
  document.getElementById('pimMainActions').hidden = false;
  document.getElementById('pimCropActions').hidden = true;
  image.style.cssText = '';
  image.className = 'pim-image';
  _pimSetStatus('');
}

async function saveProductImageCrop() {
  if (!_pimState || !_pimState.crop) return;
  const product = _pimProduct(_pimState.id);
  const image = document.getElementById('pimImage');
  const stage = document.getElementById('pimStage');
  if (!product || !image || !image.naturalWidth) return;
  _pimSetBusy(true);
  _pimSetStatus('Salvando o recorte…');
  try {
    const size = stage.clientWidth;
    const base = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const total = base * _pimState.zoom;
    const sourceSize = size / total;
    const sourceX = image.naturalWidth / 2 - (size / 2 + _pimState.x) / total;
    const sourceY = image.naturalHeight / 2 - (size / 2 + _pimState.y) / total;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 1200, 1200);
    const webp = canvas.toDataURL('image/webp', .9);
    stageCatalogProductImage(product, webp, `catalogo-${product.id}-crop-${Date.now()}.webp`);
    _pimRefreshCatalog();
    cancelProductImageCrop();
    _pimRenderImage();
    _pimSetStatus('Recorte pronto. Ele será enviado somente ao confirmar e salvar o painel.');
  } catch (error) {
    _pimSetStatus(`Não foi possível salvar o recorte: ${error.message}`, true);
  } finally {
    _pimSetBusy(false);
  }
}

document.addEventListener('pointerdown', event => {
  if (!_pimState || !_pimState.crop || event.target.id !== 'pimImage') return;
  _pimState.pointerId = event.pointerId;
  _pimState.lastX = event.clientX;
  _pimState.lastY = event.clientY;
  event.target.setPointerCapture(event.pointerId);
});

document.addEventListener('pointermove', event => {
  if (!_pimState || !_pimState.crop || _pimState.pointerId !== event.pointerId) return;
  _pimState.x += event.clientX - _pimState.lastX;
  _pimState.y += event.clientY - _pimState.lastY;
  _pimState.lastX = event.clientX;
  _pimState.lastY = event.clientY;
  _pimClampCrop();
});

document.addEventListener('pointerup', event => {
  if (_pimState && _pimState.pointerId === event.pointerId) _pimState.pointerId = null;
}

// ─── BANCO DE NOMES (salva nomes gerados pela IA) ───────────────────────────
async function saveGeneratedNamesToBank(names) {
  if (!names || !names.length) return;
  try {
    const settings = await sbFetchSettings();
    let bank = [];
    if (settings['name_bank']) {
      try { bank = JSON.parse(settings['name_bank']); } catch (e) {}
    }
    for (const n of names) {
      if (!bank.includes(n.name)) bank.push(n.name);
    }
    await sbSetSetting('name_bank', JSON.stringify(bank));
  } catch (error) {
    console.error('Falha ao salvar no Banco de Nomes', error);
  }
}

async function openNameBankModal(ctx) {
  const wrap = document.createElement('div');
  wrap.id = 'nameBankModal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(var(--modal-backdrop-rgb, 17,24,39),.65);display:flex;align-items:center;justify-content:center;';
  wrap.innerHTML = `
    <div style="background:var(--bg);border-radius:12px;padding:28px 32px;max-width:420px;width:92%;max-height:80vh;display:flex;flex-direction:column;font-family:'Jost',sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
        <div>
          <p style="font-size:16px;font-weight:700;color:var(--modal-title, var(--text));margin-bottom:4px;">Banco de Nomes</p>
          <p style="font-size:13px;color:var(--modal-muted, var(--text-muted));">Nomes gerados pela IA ficam salvos aqui.</p>
        </div>
        <button onclick="document.getElementById('nameBankModal').remove()" style="background:none;border:none;cursor:pointer;color:var(--modal-muted, var(--text-muted));font-size:20px;line-height:1;">&times;</button>
      </div>
      <div id="nameBankList" style="flex:1;overflow-y:auto;padding-right:8px;display:flex;flex-direction:column;gap:8px;">
         <p style="font-size:13px;color:var(--modal-muted, var(--text-muted));text-align:center;padding:20px 0;">Carregando...</p>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button onclick="clearNameBank()" style="padding:8px 16px;border:none;background:#b83232;color:#fff;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Limpar Banco</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  
  try {
    const settings = await sbFetchSettings();
    let bank = [];
    if (settings['name_bank']) {
       try { bank = JSON.parse(settings['name_bank']); } catch (e) {}
    }
    renderNameBankList(bank, ctx);
  } catch (error) {
    document.getElementById('nameBankList').innerHTML = `<p style="font-size:13px;color:#b83232;text-align:center;">Erro ao carregar o Banco de Nomes.</p>`;
  }
}

function renderNameBankList(bank, ctx) {
  const box = document.getElementById('nameBankList');
  if (!box) return;
  if (!bank || !bank.length) {
    box.innerHTML = `<p style="font-size:13px;color:var(--modal-muted, var(--text-muted));text-align:center;padding:20px 0;">O banco está vazio.</p>`;
    return;
  }
  
  box.innerHTML = bank.map(name => {
    const s = _pimEscape(name);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;padding:8px 12px;border:1px solid var(--line);border-radius:6px;">
        <button type="button" onclick="pickNameFromBank('${s}', '${ctx}')" style="flex:1;text-align:left;background:none;border:none;cursor:pointer;font-size:14px;color:var(--text);font-family:'Jost',sans-serif;">${s}</button>
        <button type="button" onclick="deleteNameFromBank('${s}', '${ctx}')" style="background:none;border:none;cursor:pointer;color:#b83232;font-size:16px;padding:0 4px;" title="Excluir">&times;</button>
      </div>
    `;
  }).join('');
}

function pickNameFromBank(name, ctx) {
  const input = ctx === 'new' ? document.getElementById('crudNewName') : document.getElementById(`crudName-${ctx}`);
  if (input) {
     input.value = name;
     if (ctx === 'new' && typeof crudNewNameSource !== 'undefined') crudNewNameSource = 'gemini';
  }
  document.getElementById('nameBankModal').remove();
}

async function deleteNameFromBank(name, ctx) {
  const box = document.getElementById('nameBankList');
  box.innerHTML = `<p style="font-size:13px;color:var(--modal-muted, var(--text-muted));text-align:center;padding:20px 0;">Excluindo...</p>`;
  try {
    const settings = await sbFetchSettings();
    let bank = [];
    if (settings['name_bank']) {
       try { bank = JSON.parse(settings['name_bank']); } catch (e) {}
    }
    bank = bank.filter(n => n !== name);
    await sbSetSetting('name_bank', JSON.stringify(bank));
    renderNameBankList(bank, ctx);
  } catch(e) {
    console.error(e);
    box.innerHTML = `<p style="font-size:13px;color:#b83232;text-align:center;">Erro ao excluir do banco.</p>`;
  }
}

async function clearNameBank() {
  if (!confirm('Tem certeza que deseja apagar TODOS os nomes do banco? Essa ação não pode ser desfeita.')) return;
  const box = document.getElementById('nameBankList');
  box.innerHTML = `<p style="font-size:13px;color:var(--modal-muted, var(--text-muted));text-align:center;padding:20px 0;">Limpando...</p>`;
  try {
    await sbSetSetting('name_bank', JSON.stringify([]));
    box.innerHTML = `<p style="font-size:13px;color:var(--modal-muted, var(--text-muted));text-align:center;padding:20px 0;">O banco está vazio.</p>`;
  } catch(e) {
    console.error(e);
    box.innerHTML = `<p style="font-size:13px;color:#b83232;text-align:center;">Erro ao limpar o banco.</p>`;
  }
});
