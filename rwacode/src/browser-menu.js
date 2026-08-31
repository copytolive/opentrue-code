'use strict';

(() => {
  const api = window.rwacode;
  const button = document.getElementById('browserMenuButton');
  const address = document.getElementById('addressInput');
  if (!api || !button || !address) return;

  let activeTabId = null;
  let activeProfileId = null;
  let aiReturnButton = null;

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
    .rw-ai-send{height:30px;padding:0 11px;border:1px solid rgba(103,232,255,.28);border-radius:8px;background:linear-gradient(180deg,rgba(103,232,255,.14),rgba(157,124,255,.08));color:#dffbff;font-weight:700}
    .rw-ai-send:hover{border-color:rgba(103,232,255,.55);background:rgba(103,232,255,.16)}
    .rw-ai-return{height:30px;padding:0 10px;border:1px solid rgba(123,242,194,.28);border-radius:8px;background:rgba(123,242,194,.08);color:#c8ffe8;white-space:nowrap}
    .rw-ai-signal{display:flex;align-items:center;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.045);color:#94a0b0}
    .rw-ai-signal span{margin-left:auto;font-size:8px;color:#71e2b9}
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

  function status(message) {
    const node = document.getElementById('statusMessage');
    if (node) node.textContent = message;
  }

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
      status(`Browser menu: ${error.message}`);
    }
  };

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && event.target !== button) menu.classList.remove('open');
  });
  window.addEventListener('resize', () => menu.classList.remove('open'));

  function ensureAiSignal() {
    const signals = document.querySelector('.signals');
    if (!signals || document.getElementById('signalAiContext')) return;
    const row = document.createElement('div');
    row.className = 'rw-ai-signal';
    row.innerHTML = '<b>AI local context</b><span id="signalAiContext">READY</span>';
    signals.insertBefore(row, signals.children[4] || null);
  }

  function ensureAiReturnButton() {
    if (aiReturnButton && aiReturnButton.isConnected) return aiReturnButton;
    const toolbar = document.querySelector('.browser-toolbar');
    if (!toolbar) return null;
    aiReturnButton = document.createElement('button');
    aiReturnButton.className = 'rw-ai-return';
    aiReturnButton.textContent = '↩ Local File';
    aiReturnButton.title = 'Return to the local file editor';
    aiReturnButton.onclick = async () => {
      try {
        await api.browser.setVisible(false);
        aiReturnButton.remove();
        aiReturnButton = null;
        status('Local file editor');
      } catch (error) {
        status(`Return to file: ${error.message}`);
      }
    };
    toolbar.insertBefore(aiReturnButton, document.getElementById('openExternalButton'));
    return aiReturnButton;
  }

  function bindAiBridge() {
    if (!api.ai?.sendContext) return;
    const editorHead = document.querySelector('.editor-head');
    const reveal = document.getElementById('editorRevealButton');
    if (!editorHead || !reveal || document.getElementById('editorSendAiButton')) return;

    const sendButton = document.createElement('button');
    sendButton.id = 'editorSendAiButton';
    sendButton.className = 'rw-ai-send';
    sendButton.textContent = 'Send to AI';
    sendButton.title = 'Insert this local file into the active ChatGPT, Claude, or Gemini composer. Nothing is submitted automatically.';
    editorHead.insertBefore(sendButton, reveal);

    sendButton.onclick = async () => {
      const title = document.getElementById('editorTitle');
      const editor = document.getElementById('editorText');
      const signal = document.getElementById('signalAiContext');
      const relativePath = title?.textContent?.trim();
      if (!relativePath || relativePath === 'File') {
        status('AI context: open a local file first');
        return;
      }
      const instruction = window.prompt(
        'Instruction for the active AI',
        'Read this local file carefully. Use only the provided file content unless I explicitly send more files.'
      );
      if (instruction === null) return;

      sendButton.disabled = true;
      if (signal) signal.textContent = 'SENDING';
      try {
        const result = await api.ai.sendContext(relativePath, editor?.value || '', instruction);
        await api.browser.setVisible(true);
        ensureAiReturnButton();
        if (signal) signal.textContent = result.provider.toUpperCase();
        status(`Local context inserted into ${result.provider} · ${result.path} · press Send in the provider when ready`);
      } catch (error) {
        if (signal) signal.textContent = 'ERROR';
        status(`AI context: ${error.message}`);
      } finally {
        sendButton.disabled = false;
      }
    };

    const editorPanel = document.getElementById('editorPanel');
    if (editorPanel) {
      new MutationObserver(() => {
        if (editorPanel.classList.contains('hidden') && aiReturnButton) {
          aiReturnButton.remove();
          aiReturnButton = null;
        }
      }).observe(editorPanel, { attributes: true, attributeFilter: ['class'] });
    }
  }

  ensureAiSignal();
  bindAiBridge();

  api.preview.onState?.((preview) => {
    const signal = document.getElementById('signalPreview');
    if (!signal) return;
    const url = String(preview?.url || '');
    if (preview?.state === 'ERROR' || preview?.error) signal.textContent = 'ERROR';
    else if (preview?.state === 'LOADING' || preview?.loading) signal.textContent = 'LOADING';
    else if (preview?.state === 'LIVE' && /^https?:/i.test(url)) signal.textContent = 'LIVE';
    else signal.textContent = 'IDLE';
  });

  // Main creates the first HOME tab immediately after loading the shell. Re-emit
  // that state after all renderer listeners are installed so first paint does
  // not depend on an IPC timing race.
  queueMicrotask(() => {
    api.browser.home().catch((error) => {
      status(`Startup sync: ${error.message}`);
    });
  });
})();
