/* Synchronous presentation bootstrap; never used for authorization or module selection. */
(function () {
  var key = 'comandatech_tab_brand';
  var restaurant = {
    title: 'ComandaTech - Software para Restaurantes',
    description: 'ComandaTech - Software simples e eficiente para gerenciar pedidos do seu restaurante. Controle pedidos, acompanhe o status e aumente suas vendas.',
    favicon: '/favicon.png',
    color: '#E63946'
  };
  var florist = {
    title: 'ComandaTech - Software para Floriculturas',
    description: 'ComandaTech - Software simples e eficiente para gerenciar pedidos da sua floricultura. Controle pedidos, acompanhe o status e aumente suas vendas.',
    favicon: '/favicon-florist.png',
    color: '#023c1a'
  };
  function clear() {
    try { window.sessionStorage.removeItem(key); } catch (_) {}
  }
  function read() {
    try {
      var value = JSON.parse(window.sessionStorage.getItem(key));
      return value && typeof value.companyId === 'string' && value.companyId &&
        typeof value.path === 'string' ? value : null;
    } catch (_) { return null; }
  }
  function remember(companyId) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify({
        companyId: companyId,
        path: window.location.pathname + window.location.search
      }));
    } catch (_) {}
  }
  function apply(isFlorist) {
    var brand = isFlorist ? florist : restaurant;
    document.title = brand.title;
    var favicon = document.querySelector('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.type = 'image/png';
    favicon.href = brand.favicon;
    [['description', brand.description], ['theme-color', brand.color]].forEach(function (entry) {
      var meta = document.querySelector('meta[name="' + entry[0] + '"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = entry[0];
        document.head.appendChild(meta);
      }
      meta.content = entry[1];
    });
  }
  function initialIsFlorist() {
    var pathname = window.location.pathname;
    if (pathname === '/floricultura' ||
        (pathname === '/auth' && new URLSearchParams(window.location.search).get('perfil') === 'floricultura')) {
      clear();
      return true;
    }
    // Neutral login and unrelated routes never inherit the previous company brand.
    if (pathname === '/auth') { clear(); return false; }
    var saved = read();
    return !!(saved && saved.path === pathname + window.location.search);
  }
  window.ComandaTechBranding = { apply: apply, remember: remember, clear: clear, read: read, initialIsFlorist: initialIsFlorist };
  apply(initialIsFlorist());
})();
