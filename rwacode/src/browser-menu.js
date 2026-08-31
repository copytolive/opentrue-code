'use strict';

(() => {
  const api = window.rwacode;
  const button = document.getElementById('browserMenuButton');
  const address = document.getElementById('addressInput');
  if (!api || !button || !address) return;

  let activeTabId = null;
  let activeProfileId = null;

  api.browser.onTabs((payload) => {
    activeTabId = payload.activeTabId;
    activeProfileId = payload.activeProfileId;
  });

  const style = document.createElement('style');
  style.textContent = `
    .rw-browser-menu{position:fixed;z-index:9999;width:230px;padding:8px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#0d1118;box-shadow:0 24px 70px rgba(0,0,0,.6);display:none}
    .rw-browser-menu.open{display:block}
    .rw-browser-menu button{display:flex;width:100%;height:34px;align-items:center;gap:8px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:#d9e1ec;text-align:left}
    .rw-browser-menu button:hover{background:rgba(255,255,255,.055)}
    .rw-browser-menu .sep{height:1px;margin:5px 3px;background:rgba(255,255,255,.08)}
    .rw-browser-menu small{margin-left:auto;color:#6f7b8e}
  `;
  document.head.appendChild(style);

  const menu = document.createElement('div');
  menu.className = 'rw-browser-menu';
  menu.innerHTML = `
    <button data-action="new">＋ New Tab <small>⌘T</small></button>
    <button data-action="duplicate">◫ Duplicate Tab</button>
    <button data-action="reload">↻ Reload</button>
    <button data-action="external">↗ Open Externally</button>
    <div class="sep"></div>
    <button data-action="close">× Close Tab <small>⌘W</small></button>
    <button data-action="clear">⌫ Clear Profile Site Data</button>
  `;
  document.body.appendChild(menu);

  function place() {
    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.right - 230)}px`;
    menu.style.top = `${rect.bottom + 6}px`;
  }

  button.onclick = (event) => {
    event.stopPropagation();
    place();
    menu.classList.toggle('open');
  };

  menu.onclick = async (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (!action) return;
    menu.classList.remove('open');
    try {
      if (action === 'new') await api.browser.newTab('rwacode://newtab');
      if (action === 'duplicate') await api.browser.newTab(address.value || 'rwacode://newtab');
      if (action === 'reload') await api.browser.reload();
      if (action === 'external') await api.browser.openExternal(address.value);
      if (action === 'close' && activeTabId) await api.browser.closeTab(activeTabId);
      if (action === 'clear' && activeProfileId) {
        if (window.confirm('Clear cookies, storage and login state for this browser profile only?')) {
          await api.profiles.clear(activeProfileId);
        }
      }
    } catch (error) {
      const status = document.getElementById('statusMessage');
      if (status) status.textContent = `Browser menu: ${error.message}`;
    }
  };

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && event.target !== button) menu.classList.remove('open');
  });
  window.addEventListener('resize', () => menu.classList.remove('open'));

  queueMicrotask(() => {
    api.browser.home().catch((error) => {
      const status = document.getElementById('statusMessage');
      if (status) status.textContent = `Startup sync: ${error.message}`;
    });
  });
})();
