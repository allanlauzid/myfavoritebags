// ─── Acessibilidade por teclado (compartilhado: index, looks, match) ─────────
// Torna o site navegável só com o teclado, sem reescrever o HTML existente:
//   1) Todo elemento com onclick que NÃO é nativamente focável (div, span…)
//      ganha tabindex="0" + role="button" e passa a ativar com Enter/Espaço.
//   2) Um MutationObserver reaplica isso ao conteúdo montado dinamicamente
//      (painel admin, listas, cards) — que não existe no HTML inicial.
//   3) Esc fecha o modal/overlay visível no topo (e destrava o scroll).
// O contorno de foco visível vem do CSS compartilhado (css/nav.css).
(function () {
  'use strict';

  var NATIVE = { A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1 };

  function enhance(el) {
    if (!el || el.nodeType !== 1) return;
    if (NATIVE[el.tagName]) return;
    if (el.dataset && el.dataset.kbdReady) return;
    if (el.dataset) el.dataset.kbdReady = '1';
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    el.addEventListener('keydown', function (e) {
      // Não sequestra combinações com modificadores.
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        el.click();
      }
    });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.querySelectorAll('[onclick]');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
    // O próprio nó adicionado pode ter onclick.
    if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('onclick')) enhance(root);
  }

  function init() {
    scan(document);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) scan(added[j]);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Esc fecha o overlay/modal visível no topo ──────────────────────────────
  // Modais nomeados do site + genéricos por id. Cobrimos os overlays fixos
  // conhecidos e, além deles, qualquer <div> fixo empilhado direto no body
  // (diálogos criados na hora, tipo confirmação de exclusão).
  var MODAL_SELECTOR = [
    '#genModal', '#reviewModal', '#bagModal', '#priceModal', '#galleryModal',
    '#crudEditModal', '#kupimContactModal', '.crud-modal-ov', '.admin-ov',
    '[id$="Modal"]', '[id$="modal"]'
  ].join(',');

  function isShown(el) {
    // Aberto = classe .open/.visible OU display inline/computado != none.
    if (el.classList && (el.classList.contains('open') || el.classList.contains('visible'))) return true;
    var disp = (el.style && el.style.display) || '';
    if (disp && disp !== 'none') return true;
    if (disp === 'none') return false;
    try {
      var cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    } catch (_) { return false; }
  }

  function zIndexOf(el) {
    var z = (el.style && el.style.zIndex) || '';
    if (!z) { try { z = window.getComputedStyle(el).zIndex; } catch (_) {} }
    return parseInt(z, 10) || 0;
  }

  function collectOpenOverlays() {
    var out = [];
    var named = document.querySelectorAll(MODAL_SELECTOR);
    for (var i = 0; i < named.length; i++) {
      if (isShown(named[i])) out.push(named[i]);
    }
    // Diálogos criados dinamicamente: <div> filho direto do body, posição
    // fixed, sem id, visível (ex.: confirmação de exclusão, editar preço).
    var kids = document.body ? document.body.children : [];
    for (var k = 0; k < kids.length; k++) {
      var el = kids[k];
      if (el.tagName !== 'DIV') continue;
      var inline = (el.getAttribute && el.getAttribute('style')) || '';
      if (/position\s*:\s*fixed/i.test(inline) && isShown(el) && out.indexOf(el) === -1) {
        out.push(el);
      }
    }
    return out;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var overlays = collectOpenOverlays();
    if (!overlays.length) return;
    overlays.sort(function (a, b) { return zIndexOf(b) - zIndexOf(a); });
    var top = overlays[0];
    // Prefere acionar um botão de fechar de verdade (mantém a lógica da página).
    var closeBtn = top.querySelector(
      '[onclick*="close" i],[onclick*="Close" i],[aria-label*="fechar" i],[aria-label*="Fechar" i]'
    );
    if (closeBtn) {
      closeBtn.click();
    } else if (top.classList && top.classList.contains('admin-ov')) {
      if (typeof window.closeA === 'function') window.closeA(); else top.classList.remove('open', 'visible');
    } else {
      top.style.display = 'none';
    }
    document.body.style.overflow = '';
    e.preventDefault();
    e.stopPropagation();
  }, true);
})();
