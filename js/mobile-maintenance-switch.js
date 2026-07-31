(function () {
  'use strict';

  var MOBILE_MAX_WIDTH = 768;
  var MAINTENANCE_PAGE = 'mobile-maintenance.html';
  var SETTING_KEY = 'mobile_maintenance_enabled';
  var SUPABASE_URL = 'https://xlyqytdnfpzyxmifcthp.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kzOYP-tPrXQO_y5jlFRdFw_hGA-5tBa';
  var isMobile = window.matchMedia('(max-width: ' + MOBILE_MAX_WIDTH + 'px)').matches;
  var bypassMaintenance = new URLSearchParams(window.location.search).get('desktop') === '1';

  if (!isMobile || bypassMaintenance) return;

  var destination = new URL(MAINTENANCE_PAGE, document.baseURI);
  if (window.location.pathname === destination.pathname) return;

  // Evita mostrar o site normal por um instante antes de confirmar o estado.
  document.documentElement.style.visibility = 'hidden';

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timeoutId = window.setTimeout(function () {
    if (controller) controller.abort();
    document.documentElement.style.visibility = '';
  }, 1800);

  fetch(
    SUPABASE_URL + '/rest/v1/site_settings?key=eq.' + encodeURIComponent(SETTING_KEY) + '&select=value',
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY
      },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }
  )
    .then(function (response) {
      if (!response.ok) throw new Error('Falha ao consultar a manutenção mobile.');
      return response.json();
    })
    .then(function (rows) {
      var value = rows && rows[0] ? rows[0].value : false;
      var enabled = value === true || value === 'true' || value === 1 || value === '1';
      if (enabled) {
        window.location.replace(destination.href);
        return;
      }
      document.documentElement.style.visibility = '';
    })
    .catch(function () {
      // Falha segura: nunca bloqueia o catálogo se a configuração não responder.
      document.documentElement.style.visibility = '';
    })
    .finally(function () {
      window.clearTimeout(timeoutId);
    });
})();
