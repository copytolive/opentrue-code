'use strict';

(() => {
  const api = window.rwacode;
  const button = document.getElementById('browserMenuButton');
  const address = document.getElementById('addressInput');
  if (!api || !button || !address) return;

  let activeTabId = null;
  let activeProfileId = null;
  let aiReturnButton = null;
  let aiImportButton = null;

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
    .rw-ai-return,.rw-ai-import{height:30px;padding:0 10px;border-radius:8px;white-space:nowrap}
    .rw-ai-return{border:1px solid rgba(123,242,194,.28);background:rgba(123,242,194,.08);color:#c8ffe8}
    .rw-ai-import{border:1px solid rgba(157,124,255,.28);background:rgba(157,124,255,.09);color:#e9e0ff}
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

  function clearAiToolbar() {
    aiReturnButton?.remove();
    aiImportButton?.remove();
    aiReturnButton = null;
    aiImportButton = null;
  }

  function currentEditor() {
    return {
      panel: document.getElementById('editorPanel'),
      title: document.getElementById('editorTitle'),
      text: document.getElementById('editorText'),
      dirty: document.getElementById('editorDirty'),
    };
  }

  function extractReplacement(text) {
    const matches = [...String(text || '').matchAll(/```(?:[\w.+-]+)?\s*\n([\s\S]*?)```/g)];
    if (matches.length !== 1) return null;
    return matches[0][1].replace(/\n$/, '');
  }

  function ensureAiToolbar() {
    const toolbar = document.querySelector('.browser-toolbar');
    if (!toolbar) return;

    if (!aiImportButton || !aiImportButton.isConnected) {
      aiImportButton = document.createElement('button');
      aiImportButton.className = 'rw-ai-import';
      aiImportButton.textContent = 'Import AI Reply';
      aiImportButton.title = 'Read the latest assistant reply. A single fenced code block can be loaded into the local editor as an unsaved proposal.';
      aiImportButton.onclick = async () => {
        const signal = document.getElementById('signalAiContext');
        const editor = currentEditor();
        if (!editor.panel || editor.panel.classList.contains('hidden')) {
          status('AI import: open a local file first');
          return;
        }
        aiImportButton.disabled = true;
        if (signal) signal.textContent = 'READING';
        try {
          const result = await api.ai.readReply();
          const replacement = extractReplacement(result.text);
          if (replacement == null) {
            if (signal) signal.textContent = result.provider.toUpperCase();
            status('AI reply read, but it does not contain exactly one fenced replacement code block. Nothing was changed.');
            return;
          }
          editor.text.value = replacement;
          editor.text.dispatchEvent(new Event('input', { bubbles: true }));
          await api.browser.setVisible(false);
          clearAiToolbar();
          if (signal) signal.textContent = 'PROPOSAL';
          status(`AI proposal loaded from ${result.provider} · review it, then press Save to write the local file`);
        } catch (error) {
          if (signal) signal.textContent = 'ERROR';
          status(`AI import: ${error.message}`);
        } finally {
          if (aiImportButton) aiImportButton.disabled = false;
        }
      };
      toolbar.insertBefore(aiImportButton, document.getElementById('openExternalButton'));
    }

    if (!aiReturnButton || !aiReturnButton.isConnected) {
      aiReturnButton = document.createElement('button');
      aiReturnButton.className = 'rw-ai-return';
      aiReturnButton.textContent = '↩ Local File';
      aiReturnButton.title = 'Return to the local file editor without importing anything';
      aiReturnButton.onclick = async () => {
        try {
          await api.browser.setVisible(false);
          clearAiToolbar();
          status('Local file editor');
        } catch (error) {
          status(`Return to file: ${error.message}`);
        }
      };
      toolbar.insertBefore(aiReturnButton, document.getElementById('openExternalButton'));
    }
  }

  function bindAiBridge() {
    if (!api.ai?.sendFile || !api.ai?.readReply) return;
    const editorHead = document.querySelector('.editor-head');
    const reveal = document.getElementById('editorRevealButton');
    if (!editorHead || !reveal || document.getElementById('editorSendAiButton')) return;

    const sendButton = document.createElement('button');
    sendButton.id = 'editorSendAiButton';
    sendButton.className = 'rw-ai-send';
    sendButton.textContent = 'Send to AI';
    sendButton.title = 'Insert this selected local file into the active ChatGPT, Claude, or Gemini composer. RWACode will not press Send for you.';
    editorHead.insertBefore(sendButton, reveal);

    sendButton.onclick = async () => {
      const signal = document.getElementById('signalAiContext');
      const editor = currentEditor();
      const relativePath = editor.title?.textContent?.trim();
      if (!relativePath || relativePath === 'File') {
        status('AI context: open a local file first');
        return;
      }

      if (editor.dirty && !editor.dirty.classList.contains('hidden')) {
        const saveFirst = window.confirm('This file has unsaved edits. Save them before sending the file to the active AI?');
        if (!saveFirst) {
          status('AI context cancelled; unsaved edits were not sent');
          return;
        }
        await api.files.write(relativePath, editor.text?.value || '');
        editor.dirty.classList.add('hidden');
      }

      const instruction = window.prompt(
        'Instruction for the active AI',
        'Read this local file carefully. If you modify it, return the complete replacement file in exactly one fenced code block.'
      );
      if (instruction === null) return;

      sendButton.disabled = true;
      if (signal) signal.textContent = 'SENDING';
      try {
        const result = await api.ai.sendFile(relativePath, instruction);
        await api.browser.setVisible(true);
        ensureAiToolbar();
        if (signal) signal.textContent = result.provider.toUpperCase();
        status(`Local file inserted into ${result.provider} · RWACode did not submit it · review the prompt and press Send when ready`);
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
        if (editorPanel.classList.contains('hidden')) clearAiToolbar();
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

  queueMicrotask(() => {
    api.browser.home().catch((error) => {
      status(`Startup sync: ${error.message}`);
    });
  });
})();
