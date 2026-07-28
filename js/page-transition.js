// ═══════════════════════════════════════════════════════════════════════════
// TRANSIÇÃO ENTRE SITES (Bags ⇄ Looks ⇄ Match) — compartilhado entre
// index.html, looks.html e match.html.
//
// A cortina em si (#pageCurtain) NÃO é criada por este arquivo — ela já
// existe no HTML de cada página, logo no topo do <body>, junto com um
// pequeno <script> síncrono que decide, antes de qualquer coisa ser
// pintada na tela, se ela deve nascer "fechada" (cobrindo tudo) ou
// escondida fora da tela. Isso evita o "piscar" branco entre uma página e
// outra: se esse trabalho fosse feito só aqui (um arquivo carregado no fim
// da página), o navegador já teria pintado a página em branco antes da
// cortina existir.
//
// Este arquivo cuida do resto:
//   1. Continuar a animação de entrada (a cortina, já fechada, desce mais
//      um pouco e sai de vista, revelando a página);
//   2. Interceptar cliques nos links entre os três sites, fechar a cortina
//      (com a cor e a logo do site de destino) e só então navegar.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const STORAGE_KEY = 'mfb_curtain_in';

  // Cor e logo da cortina por página de destino.
  const CURTAIN_DATA = {
    'index.html': { color: '#2A1F18', logo: 'webp/LogoMFB_B.webp' },
    'looks.html': { color: '#111827', logo: 'webp/LogoMFL_B_gold.webp' },
    'match.html': { color: '#4A2318', logo: 'webp/logo-my-favorite-match-mini.webp', logoClass: 'is-match-logo' },
  };

  const CROSS_LINK_SELECTOR = [
    '#navLooksBtn', '#bijusHeroBtn', '#navBagsBtn', '#matchHeroBtn',
    '#mConfigBagsBtn', '#mExitConfig', '#mExitCard',
    'a[href^="index.html"]', 'a[href^="looks.html"]', 'a[href^="match.html"]',
  ].join(', ');

  function targetFile(href) {
    try { return new URL(href, location.href).pathname.split('/').pop() || 'index.html'; }
    catch (e) { return href; }
  }

  function getCurtain() { return document.getElementById('pageCurtain'); }

  // ── ACELERAÇÃO DA CORTINA ────────────────────────────────────────────────
  // Tocar/clicar em qualquer lugar da tela enquanto a cortina está ativa
  // (entrando ou saindo) acelera suavemente o que está em andamento, sem
  // cortar: as transições CSS já em curso (fade do fundo, fade da logo)
  // continuam do ponto exato em que estão, só passam a avançar mais rápido
  // (via playbackRate da Web Animations API) — e os temporizadores que ainda
  // faltam disparar são reagendados proporcionalmente ao tempo restante.
  let curtainBoost = 1;
  const BOOST_STEP = 1.7;   // cada toque multiplica a velocidade atual por isso
  const BOOST_MAX  = 6;     // teto — nunca fica instantâneo
  const boostTimers = new Set();

  // Substitui setTimeout nas partes da sequência que devem respeitar o boost.
  function boostSetTimeout(fn, ms) {
    const t = { fn, remaining: ms, since: (performance || Date).now(), rate: curtainBoost, id: 0 };
    t.id = setTimeout(() => { boostTimers.delete(t); fn(); }, ms / curtainBoost);
    boostTimers.add(t);
    return t;
  }

  function curtainIsActive() {
    const el = getCurtain();
    return !!el && (el.classList.contains('is-closing') || el.classList.contains('is-closed') || el.classList.contains('is-opening'));
  }

  // Aplica a velocidade de boost atual a qualquer transição CSS em
  // andamento na cortina/logo agora mesmo — usada tanto quando o usuário
  // toca na tela (acelera o que já está rodando) quanto logo depois de
  // disparar uma nova fase da sequência (caso o boost já estivesse ativo
  // de um toque anterior, a fase nova nasce direto na velocidade certa).
  function applyBoostToAnimations() {
    const el = getCurtain();
    const logoEl = el && el.querySelector('.page-curtain-logo');
    [el, logoEl].forEach(node => {
      if (node && node.getAnimations) {
        node.getAnimations().forEach(anim => { try { anim.playbackRate = curtainBoost; } catch (e) {} });
      }
    });
  }

  function boostCurtain() {
    if (!curtainIsActive() || curtainBoost >= BOOST_MAX) return;
    curtainBoost = Math.min(curtainBoost * BOOST_STEP, BOOST_MAX);
    const now = (performance || Date).now();

    // Acelera as transições CSS já rodando (fundo e logo), preservando o
    // progresso atual — não pula nem reinicia, só avança mais rápido dali.
    applyBoostToAnimations();

    // Reagenda os temporizadores pendentes pelo tempo restante, na nova velocidade.
    boostTimers.forEach(t => {
      clearTimeout(t.id);
      const virtualElapsed = (now - t.since) * t.rate;
      t.remaining = Math.max(t.remaining - virtualElapsed, 0);
      t.since = now;
      t.rate = curtainBoost;
      t.id = setTimeout(() => { boostTimers.delete(t); t.fn(); }, t.remaining / curtainBoost);
    });
  }

  function resetCurtainBoost() { curtainBoost = 1; }

  // Fecha a cortina (cor/logo do destino) e só então navega. Usada tanto
  // pelo listener de clique padrão (wireCrossLink) quanto por botões que já
  // têm sua própria lógica de clique e chamam isso manualmente — como o
  // #matchHeroBtn, que é arrastável e precisa decidir antes se o clique foi
  // um arraste ou um clique de verdade (por isso já dá preventDefault por
  // conta própria, antes da cortina entrar em ação).
  // Sequência (total ~5.2s: 830 + 2650 + 720 + 1000, esperando a logo até
  // 1500ms no fade-out): clique → tela funde pro tom pérola → troca de
  // página (ainda pérola) → funde a logo do site que chegou (bem mais
  // devagar que o fundo) → segura → funde tudo de volta (fundo em 1s,
  // logo em 1.5s — a logo demora mais que o fundo pra sumir).
  const FADE_IN_MS  = 800;  // fade-in do tom pérola, ao clicar (bate com a
                             // transition:opacity de .page-curtain no nav.css)
  const NAV_WAIT_MS = 830;  // espera antes de navegar (fade-in + margem) — sem mudança
  const LOGO_IN_MS  = 2650; // fade-in da logo do site que chegou — bem mais
                             // longo que o fade-in do fundo (800ms)
  const HOLD_MS         = 2000;  // logo fica visível parada antes do fade-out
  const HOLD_BG_MS      = 1800; // fundo fica visível parado antes do fade-out
  const FADE_OUT_BG_MS  = 5500; // fade-out final do FUNDO (bate com a
                                 // transition:opacity de .is-opening no nav.css)
  const FADE_OUT_LOGO_MS = 2400; // fade-out final da LOGO — mais devagar que o fundo

  function navigateWithCurtain(href) {
    const file = targetFile(href);
    const data = CURTAIN_DATA[file];
    const curEl = getCurtain();
    if (!data || !curEl) { window.location.href = href; return; }
    // try/catch: com cookies/dados de site bloqueados o setItem lança
    // SecurityError — sem a proteção, o clique no link morria aqui e a
    // navegação nem acontecia. Sem storage, só se perde a animação.
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
    // Nenhuma logo aparece durante o fade-in pérola — só a tela funde.
    const logoEl = curEl.querySelector('.page-curtain-logo');
    if (logoEl) {
      logoEl.style.transition = 'none';
      logoEl.style.opacity = '0';
      logoEl.removeAttribute('src');
      logoEl.style.display = 'none';
    }
    resetCurtainBoost();
    curEl.classList.remove('is-open');
    requestAnimationFrame(() => { curEl.classList.add('is-closing'); applyBoostToAnimations(); });
    // O fade-in (FADE_IN_MS, ver .page-curtain em css/nav.css) precisa
    // terminar antes de navegar — NAV_WAIT_MS já inclui essa margem.
    // boostSetTimeout: se o usuário tocar na tela durante o fade-in, o
    // tempo de espera restante é reduzido na mesma proporção da aceleração.
    boostSetTimeout(() => { window.location.href = href; }, NAV_WAIT_MS);
  }
  window.mfbNavigateWithCurtain = navigateWithCurtain;

  // ── ENTRADA: o script inline no topo do <body> já deixou a cortina no
  // tom pérola (classe "is-closed") e a logo do site novo pronta (em
  // opacidade 0) se viemos de um clique com transição. Aqui: funde a
  // logo pra dentro, segura um instante, e funde tudo de volta revelando
  // a página.
  function playEntrance() {
    const el = getCurtain();
    if (!el || !el.classList.contains('is-closed')) return;
    resetCurtainBoost();
    const logoEl = el.querySelector('.page-curtain-logo');

    // Fundo e logo agora têm holds independentes (HOLD_BG_MS / HOLD_MS),
    // cada um disparando seu próprio fade-out no seu próprio momento.
    const fadeOutBg = () => {
      requestAnimationFrame(() => {
        el.classList.remove('is-closed');
        // Força o navegador a aplicar o estado "sem transição" (is-closed)
        // antes de ligar o is-opening — sem isso, as duas trocas de classe
        // podem ser fundidas num único recálculo de estilo, e o fundo pula
        // direto pro final em vez de rodar sua própria transição.
        void el.offsetWidth;
        el.classList.add('is-opening');
        applyBoostToAnimations();
      });
    };

    const fadeOutLogo = () => {
      if (!logoEl) return;
      logoEl.style.transition = `opacity ${FADE_OUT_LOGO_MS}ms ease`;
      // Força o navegador a "registrar" essa nova duração antes de mudar
      // a opacidade — sem isso, às vezes o browser aplica a mudança sem
      // transição (ou com a duração antiga), fazendo a logo sumir junto
      // com o fundo em vez de demorar mais.
      void logoEl.offsetWidth;
      logoEl.style.opacity = '0';
      applyBoostToAnimations();
    };

    const scheduleFadeOut = () => {
      boostSetTimeout(fadeOutBg, HOLD_BG_MS);
      boostSetTimeout(fadeOutLogo, HOLD_MS);
      // Estaciona a cortina (is-open) só depois do maior dos dois
      // fade-outs terminar, pra não cortar nenhum dos dois no meio.
      const bgEnd = HOLD_BG_MS + FADE_OUT_BG_MS;
      const logoEnd = HOLD_MS + FADE_OUT_LOGO_MS;
      boostSetTimeout(() => {
        el.classList.remove('is-opening');
        el.classList.add('is-open');
      }, Math.max(bgEnd, logoEnd));
    };

    if (logoEl && logoEl.getAttribute('src')) {
      requestAnimationFrame(() => {
        logoEl.style.transition = `opacity ${LOGO_IN_MS}ms ease`;
        void logoEl.offsetWidth;
        logoEl.style.opacity = '1';
        applyBoostToAnimations();
        scheduleFadeOut();
      });
    } else {
      scheduleFadeOut();
    }
  }

  // ── SAÍDA: intercepta o clique, fecha a cortina (com a cor/logo do
  // destino) e só depois navega de verdade.
  function wireCrossLink(el) {
    if (!el || el.dataset.curtainWired) return;
    if (el.target === '_blank') return; // abre em outra aba, sem transição
    el.dataset.curtainWired = '1';
    el.addEventListener('click', e => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
      const href = el.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      const file = targetFile(href);
      if (!CURTAIN_DATA[file]) return; // não é um link entre os 3 sites
      e.preventDefault();
      navigateWithCurtain(href);
    });
  }

  function wireAll() {
    document.querySelectorAll(CROSS_LINK_SELECTOR).forEach(wireCrossLink);
  }

  // Pré-carrega as outras páginas do trio (Bags/Looks/Match) em segundo
  // plano, assim que esta termina de carregar. Isso reduz bastante a
  // chance de um frame em branco aparecer durante a troca de página,
  // porque o navegador já tem o próximo HTML pronto antes do clique.
  function prefetchOtherPages() {
    const here = targetFile(location.pathname);
    Object.keys(CURTAIN_DATA).forEach(file => {
      if (file === here) return;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = file;
      document.head.appendChild(link);
    });
  }

  playEntrance();
  wireAll();
  if (document.readyState === 'complete') prefetchOtherPages();
  else window.addEventListener('load', prefetchOtherPages, { once: true });
  // Vários desses botões são inseridos dinamicamente depois do load inicial
  // (ex: bijusHeroBtn, matchHeroBtn) — reobserva o DOM pra pegar esses casos.
  new MutationObserver(wireAll).observe(document.body, { childList: true, subtree: true });

  // ═════════════════════════════════════════════════════════════════════════
  // NAVEGAÇÃO MOBILE — gesto de arrastar a logo (Bags⇄Looks, cortina lateral)
  // e barra de navegação inferior (index.html/looks.html). Só faz sentido
  // dentro do breakpoint mobile do site (768px), mas os listeners podem
  // ficar registrados sempre — em telas largas os elementos estão com
  // display:none via CSS e o gesto de swipe não tem nenhum elemento visível
  // pra disparar (o toque simplesmente não encontra o alvo).
  // ═════════════════════════════════════════════════════════════════════════
  function wireLogoSwipe() {
    const el = document.getElementById('navLogoSwipe');
    if (!el || el.dataset.swipeWired) return;
    el.dataset.swipeWired = '1';
    const target = el.dataset.swipeTarget;
    const reverse = el.dataset.swipeReverse === '1';
    if (!target) return;
    let startX = 0, startY = 0, tracking = false, fired = false;
    const THRESHOLD = 90;

    el.addEventListener('touchstart', e => {
      if (window.innerWidth > 768) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      tracking = true; fired = false;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if (!tracking || fired) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Cancela se o movimento for mais vertical que horizontal.
      if (Math.abs(dy) > Math.abs(dx)) return;
      // Direção esperada: index→looks arrasta pra direita (dx>0);
      // looks→index arrasta pra esquerda (dx<0).
      const wantsPositive = !reverse;
      const magnitude = wantsPositive ? dx : -dx;
      if (magnitude > THRESHOLD) {
        fired = true; tracking = false;
        navigateWithCurtain(target);
      }
    }, { passive: true });

    el.addEventListener('touchend', () => { tracking = false; }, { passive: true });
    el.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
  }

  function scrollToTopSmooth() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scrollToCatalogSmooth() {
    const el = document.getElementById('catalogo') || document.querySelector('.catalog');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wireBottomNav() {
    const nav = document.getElementById('mobileBottomNav');
    if (!nav || nav.dataset.wired) return;
    nav.dataset.wired = '1';

    const homeBtn = document.getElementById('mbnHome');
    if (homeBtn) homeBtn.addEventListener('click', scrollToTopSmooth);

    const catBtn = document.getElementById('mbnCatalogo');
    if (catBtn) catBtn.addEventListener('click', scrollToCatalogSmooth);

    const matchBtn = document.getElementById('mbnMatch');
    if (matchBtn) {
      matchBtn.addEventListener('click', e => {
        e.preventDefault();
        navigateWithCurtain('match.html');
      });
    }
    // #mbnInstagram e #mbnWhatsapp são links normais (target="_blank"),
    // não precisam de wiring — abrem em nova aba direto pelo href.
  }

  // Toque/clique em qualquer lugar da tela, ou qualquer tecla do teclado,
  // acelera a cortina, se ela estiver ativa no momento (a checagem fica
  // dentro de boostCurtain — fora disso o listener não faz nada, então é
  // seguro deixar sempre ligado).
  document.addEventListener('pointerdown', boostCurtain, { passive: true });
  document.addEventListener('keydown', boostCurtain);

  wireLogoSwipe();
  wireBottomNav();
})();
