'use strict';

(() => {
  const api = window.rwacode;
  const button = document.getElementById('browserMenuButton');
  const address = document.getElementById('addressInput');
  if (!api || !button || !address) return;

  let activeTabId = null;
  let activeProfileId = null;
  let currentTabs = [];
  let dialogResolver = null;

  api.browser.onTabs((payload) => {
    activeTabId = payload.activeTabId;
    activeProfileId = payload.activeProfileId;
    currentTabs = Array.isArray(payload.tabs) ? payload.tabs : [];
  });

  const style = document.createElement('style');
  style.textContent = `
    .rw-browser-menu{position:fixed;z-index:9999;width:230px;padding:8px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#0d1118;box-shadow:0 24px 70px rgba(0,0,0,.6);display:none}
    .rw-browser-menu.open{display:block}
    .rw-browser-menu button{display:flex;width:100%;height:34px;align-items:center;gap:8px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:#d9e1ec;text-align:left}
    .rw-browser-menu button:hover{background:rgba(255,255,255,.055)}
    .rw-browser-menu .sep{height:1px;margin:5px 3px;background:rgba(255,255,255,.08)}
    .rw-browser-menu small{margin-left:auto;color:#6f7b8e}
    .rw-editor-ai{height:30px;padding:0 10px;border:1px solid rgba(103,232,255,.24);border-radius:8px;background:rgba(103,232,255,.08);color:#dffbff;font-weight:700}
    .rw-editor-ai.secondary{border-color:rgba(157,124,255,.22);background:rgba(157,124,255,.07);color:#e8e0ff}
    .rw-editor-ai:hover{border-color:rgba(103,232,255,.48)}
    .rw-dialog-backdrop{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;background:rgba(2,5,9,.72);backdrop-filter:blur(8px)}
    .rw-dialog-backdrop.hidden{display:none}
    .rw-dialog{width:min(520px,calc(100vw - 48px));border:1px solid rgba(103,232,255,.2);border-radius:16px;background:#0b1017;box-shadow:0 30px 100px rgba(0,0,0,.72);overflow:hidden;color:#e6eef8}
    .rw-dialog-head{padding:16px 18px 8px;font-size:13px;font-weight:800;letter-spacing:.01em}
    .rw-dialog-message{padding:0 18px 12px;color:#8f9bad;font-size:11px;line-height:1.5;white-space:pre-wrap}
    .rw-dialog-input{box-sizing:border-box;width:calc(100% - 36px);margin:0 18px 14px;min-height:38px;border:1px solid rgba(255,255,255,.12);border-radius:10px;outline:0;background:#070b10;color:#e9f3ff;padding:10px 12px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
    .rw-dialog-input:focus{border-color:rgba(103,232,255,.48);box-shadow:0 0 0 2px rgba(103,232,255,.08)}
    .rw-dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;border-top:1px solid rgba(255,255,255,.06)}
    .rw-dialog-actions button{height:34px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#121925;color:#dce7f4;padding:0 14px}
    .rw-dialog-actions .primary{border-color:rgba(103,232,255,.28);background:rgba(103,232,255,.11);color:#e9fbff;font-weight:700}
    .rw-dialog-actions .danger{border-color:rgba(255,106,122,.28);background:rgba(255,106,122,.09);color:#ffd9de}
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

  const dialog = document.createElement('div');
  dialog.id = 'rwacodeDialog';
  dialog.className = 'rw-dialog-backdrop hidden';
  dialog.innerHTML = `
    <section class="rw-dialog" role="dialog" aria-modal="true" aria-labelledby="rwDialogTitle">
      <div id="rwDialogTitle" class="rw-dialog-head">RWACode</div>
      <div id="rwDialogMessage" class="rw-dialog-message"></div>
      <input id="rwDialogInput" class="rw-dialog-input" autocomplete="off" spellcheck="false" />
      <div class="rw-dialog-actions">
        <button id="rwDialogCancel">Cancel</button>
        <button id="rwDialogConfirm" class="primary">Continue</button>
      </div>
    </section>
  `;
  document.body.appendChild(dialog);

  const dialogTitle = dialog.querySelector('#rwDialogTitle');
  const dialogMessage = dialog.querySelector('#rwDialogMessage');
  const dialogInput = dialog.querySelector('#rwDialogInput');
  const dialogCancel = dialog.querySelector('#rwDialogCancel');
  const dialogConfirm = dialog.querySelector('#rwDialogConfirm');

  function status(message) {
    const node = document.getElementById('statusMessage');
    if (node) node.textContent = message;
  }

  function runtimeState() {
    try { return state; } catch { return null; }
  }

  function browserShouldBeVisible() {
    const editorHidden = document.getElementById('editorPanel')?.classList.contains('hidden') !== false;
    const proposalHidden = document.getElementById('proposalPanel')?.classList.contains('hidden') !== false;
    return editorHidden && proposalHidden && address.value !== 'rwacode://newtab';
  }

  async function setBrowserVisible(visible) {
    try { await api.browser.setVisible(visible); } catch {}
  }

  function aiProviderFromUrl(value) {
    try {
      const host = new URL(String(value || '')).hostname.toLowerCase();
      if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'ChatGPT';
      if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
      if (host === 'gemini.google.com') return 'Gemini';
    } catch {}
    return null;
  }

  async function ensureAiProviderTab() {
    const currentProvider = aiProviderFromUrl(address.value);
    if (currentProvider) {
      await setBrowserVisible(true);
      return currentProvider;
    }

    const existing = [...currentTabs].reverse().find((tab) => aiProviderFromUrl(tab.url));
    if (existing) {
      await api.browser.switchTab(existing.id);
      await setBrowserVisible(true);
      return aiProviderFromUrl(existing.url);
    }

    if (address.value !== 'rwacode://newtab') {
      await api.browser.newTab('rwacode://newtab');
    }
    await api.browser.navigate('https://chatgpt.com/');
    await setBrowserVisible(true);
    return 'ChatGPT';
  }

  function finishDialog(value) {
    if (!dialogResolver) return;
    const resolve = dialogResolver;
    dialogResolver = null;
    dialog.classList.add('hidden');
    dialogInput.value = '';
    resolve(value);
  }

  async function openDialog({ title, message = '', value = '', input = true, confirmLabel = 'Continue', danger = false }) {
    if (dialogResolver) finishDialog(null);
    const restoreBrowser = browserShouldBeVisible();
    await setBrowserVisible(false);

    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    dialogInput.classList.toggle('hidden', !input);
    dialogInput.value = value;
    dialogConfirm.textContent = confirmLabel;
    dialogConfirm.classList.toggle('danger', danger);
    dialogConfirm.classList.toggle('primary', !danger);
    dialog.classList.remove('hidden');

    const result = await new Promise((resolve) => {
      dialogResolver = resolve;
      queueMicrotask(() => (input ? dialogInput : dialogConfirm).focus());
    });

    if (restoreBrowser && browserShouldBeVisible()) await setBrowserVisible(true);
    return result;
  }

  function uiPrompt(title, value = '', message = '') {
    return openDialog({ title, message, value, input: true, confirmLabel: 'Continue' });
  }

  function uiConfirm(title, message = '', confirmLabel = 'Confirm', danger = false) {
    return openDialog({ title, message, input: false, confirmLabel, danger }).then((value) => value === true);
  }

  dialogCancel.onclick = () => finishDialog(null);
  dialogConfirm.onclick = () => finishDialog(dialogInput.classList.contains('hidden') ? true : dialogInput.value);
  dialog.onclick = (event) => { if (event.target === dialog) finishDialog(null); };
  dialogInput.onkeydown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); finishDialog(dialogInput.value); }
    if (event.key === 'Escape') { event.preventDefault(); finishDialog(null); }
  };
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); finishDialog(null); }
  });

  window.rwacodeDialogs = { prompt: uiPrompt, confirm: uiConfirm };

  // Electron intentionally does not support window.prompt(). Replace the
  // renderer flows that used it with an in-app async dialog while keeping the
  // provider WebContentsView hidden behind the dialog.
  try {
    const originalCloseEditor = closeEditor;
    closeEditor = async function patchedCloseEditor(confirmDirty = false) {
      const s = runtimeState();
      if (!s?.editorPath) return true;
      if (confirmDirty && s.editorDirty) {
        const discard = await uiConfirm(
          'Discard unsaved changes?',
          `The local file ${s.editorPath} has unsaved changes.`,
          'Discard',
          true,
        );
        if (!discard) return false;
      }
      return originalCloseEditor(false);
    };
  } catch {}

  async function sendFileToActiveAi() {
    const s = runtimeState();
    const selectedRow = document.querySelector('.file-row.selected');
    const target = s?.editorPath || s?.selectedPath || selectedRow?.dataset.path || null;
    if (!target) { status('AI bridge: select a local file first'); return; }

    try {
      if (s?.editorPath === target && s?.editorDirty && typeof saveEditor === 'function') await saveEditor();

      const instruction = await uiPrompt(
        'Send selected local file to AI',
        'Read this file and explain it. If changes are needed, return the complete replacement file in one fenced code block.',
        `Only this file will be shared:\n${target}\n\nRWACode will use the current AI tab, switch to an existing ChatGPT/Claude/Gemini tab, or open ChatGPT when no provider tab exists. It will not press Send automatically.`,
      );
      if (instruction === null) { status('AI bridge: cancelled'); return; }

      if (s?.editorPath && typeof closeEditor === 'function') await closeEditor(false);
      if (s?.proposalPath && typeof cancelProposal === 'function') await cancelProposal();

      document.getElementById('signalAiBridge').textContent = 'ROUTING';
      document.getElementById('aiBridgeBadge').textContent = 'AI BRIDGE · ROUTING';
      const routedProvider = await ensureAiProviderTab();
      status(`AI bridge: routing selected file to ${routedProvider}`);

      document.getElementById('signalAiBridge').textContent = 'SENDING';
      document.getElementById('aiBridgeBadge').textContent = 'AI BRIDGE · SENDING';
      const result = await api.ai.sendFile(target, instruction);
      document.getElementById('fileActions')?.classList.add('hidden');
      document.getElementById('signalAiBridge').textContent = result.submitted ? 'SENT' : 'COMPOSER';
      document.getElementById('aiBridgeBadge').textContent = `AI BRIDGE · ${result.provider.toUpperCase()}`;
      status(result.submitted
        ? `Sent ${target} to ${result.provider} · only this file was shared`
        : `${result.provider}: local file inserted into composer · review it and press Send manually`);
    } catch (error) {
      document.getElementById('signalAiBridge').textContent = 'ERROR';
      document.getElementById('aiBridgeBadge').textContent = 'AI BRIDGE · ERROR';
      status(`AI bridge: ${error.message}`);
    }
  }

  try { sendSelectedToAi = sendFileToActiveAi; } catch {}

  try {
    fileAction = async function patchedFileAction(action) {
      const s = runtimeState();
      try {
        if (action === 'ai-send') { await sendFileToActiveAi(); return; }
        if (action === 'ai-import') { await importAiReply(); return; }
        if (action === 'new-file' || action === 'new-folder') {
          const name = await uiPrompt(action === 'new-file' ? 'New file name' : 'New folder name');
          if (!name?.trim()) return;
          await api.files.create(s?.currentDir || '.', name.trim(), action === 'new-folder' ? 'directory' : 'file');
          if (typeof loadDirectory === 'function') await loadDirectory();
          document.getElementById('fileActions')?.classList.add('hidden');
          return;
        }
        if (!s?.selectedPath) { status('Select a file or folder first'); return; }
        if (action === 'reveal') await api.files.reveal(s.selectedPath);
        if (action === 'rename') {
          const currentName = s.selectedPath.split('/').at(-1);
          const name = await uiPrompt('Rename local item', currentName, s.selectedPath);
          if (!name?.trim() || name.trim() === currentName) return;
          await api.files.rename(s.selectedPath, name.trim());
          s.selectedPath = null;
          if (typeof loadDirectory === 'function') await loadDirectory();
        }
        if (action === 'delete') {
          const confirmed = await api.files.confirmDelete(s.selectedPath);
          if (!confirmed) return;
          if (s.editorPath === s.selectedPath && typeof closeEditor === 'function') await closeEditor(false);
          await api.files.delete(s.selectedPath);
          s.selectedPath = null;
          if (typeof loadDirectory === 'function') await loadDirectory();
        }
        document.getElementById('fileActions')?.classList.add('hidden');
      } catch (error) { status(`${action}: ${error.message}`); }
    };
  } catch {}

  const addProfileButton = document.getElementById('addProfileButton');
  if (addProfileButton) addProfileButton.onclick = async () => {
    if (typeof closeEditor === 'function' && !(await closeEditor(true))) return;
    const s = runtimeState();
    if (s?.proposalPath && typeof cancelProposal === 'function') await cancelProposal();
    const name = await uiPrompt('New browser profile name');
    if (!name?.trim()) return;
    const result = await api.profiles.add(name.trim());
    if (s) { s.profiles = result.profiles; s.activeProfileId = result.activeProfileId; }
    if (typeof renderProfiles === 'function') renderProfiles();
  };

  const renameProfileButton = document.getElementById('renameProfileButton');
  if (renameProfileButton) renameProfileButton.onclick = async () => {
    const s = runtimeState();
    const profile = typeof activeProfile === 'function' ? activeProfile() : null;
    if (!profile) return;
    const name = await uiPrompt('Rename browser profile', profile.name);
    if (!name?.trim()) return;
    const result = await api.profiles.rename(profile.id, name.trim());
    if (s) s.profiles = result.profiles;
    if (typeof renderProfiles === 'function') renderProfiles();
  };

  const clearProfileButton = document.getElementById('clearProfileButton');
  if (clearProfileButton) clearProfileButton.onclick = async () => {
    if (typeof closeEditor === 'function' && !(await closeEditor(true))) return;
    const s = runtimeState();
    if (s?.proposalPath && typeof cancelProposal === 'function') await cancelProposal();
    const profile = typeof activeProfile === 'function' ? activeProfile() : null;
    if (!profile) return;
    const confirmed = await uiConfirm(
      'Clear profile site data?',
      `${profile.name}: cookies, storage and login state will be cleared. Other profiles are unaffected.`,
      'Clear data',
      true,
    );
    if (!confirmed) return;
    await api.profiles.clear(profile.id);
    status(`Cleared ${profile.name} site data`);
  };

  const deleteProfileButton = document.getElementById('deleteProfileButton');
  if (deleteProfileButton) deleteProfileButton.onclick = async () => {
    if (typeof closeEditor === 'function' && !(await closeEditor(true))) return;
    const s = runtimeState();
    if (s?.proposalPath && typeof cancelProposal === 'function') await cancelProposal();
    const profile = typeof activeProfile === 'function' ? activeProfile() : null;
    if (!profile) return;
    const confirmed = await uiConfirm('Delete browser profile?', profile.name, 'Delete profile', true);
    if (!confirmed) return;
    const result = await api.profiles.delete(profile.id);
    if (s) { s.profiles = result.profiles; s.activeProfileId = result.activeProfileId; }
    if (typeof renderProfiles === 'function') renderProfiles();
  };

  const proposalApplyButton = document.getElementById('proposalApplyButton');
  if (proposalApplyButton) proposalApplyButton.onclick = async () => {
    const s = runtimeState();
    const target = s?.proposalPath || document.getElementById('proposalPath')?.textContent?.trim();
    if (!target) return;
    const confirmed = await uiConfirm(
      'Apply reviewed AI replacement?',
      `RWACode will replace only this root-locked file:\n${target}`,
      'Apply replacement',
      true,
    );
    if (!confirmed) return;
    try {
      const content = document.getElementById('proposalText')?.value || '';
      const result = await api.files.write(target, content);
      if (s) { s.proposalPath = null; s.proposalProvider = null; s.selectedPath = target; }
      document.getElementById('proposalPanel')?.classList.add('hidden');
      document.getElementById('signalAiBridge').textContent = 'APPLIED';
      document.getElementById('aiBridgeBadge').textContent = 'AI BRIDGE · APPLIED';
      if (typeof loadDirectory === 'function') await loadDirectory(s?.currentDir || '.', true);
      if (typeof openEditor === 'function') await openEditor(result.path);
      status(`Applied reviewed AI replacement · ${result.path}`);
    } catch (error) {
      document.getElementById('signalAiBridge').textContent = 'ERROR';
      status(`Apply AI proposal: ${error.message}`);
    }
  };

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
        const confirmed = await uiConfirm(
          'Clear current browser profile?',
          'Cookies, storage and login state for this profile will be cleared. Other profiles are unaffected.',
          'Clear data',
          true,
        );
        if (confirmed) await api.profiles.clear(activeProfileId);
      }
    } catch (error) {
      status(`Browser menu: ${error.message}`);
    }
  };

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && event.target !== button) menu.classList.remove('open');
  });
  window.addEventListener('resize', () => menu.classList.remove('open'));

  // Keep a single canonical AI flow. The editor buttons proxy into the patched
  // root-locked action so the selected file, not ChatGPT Library, is shared.
  const editorHead = document.querySelector('.editor-head');
  const reveal = document.getElementById('editorRevealButton');
  if (editorHead && reveal) {
    const send = document.createElement('button');
    send.id = 'editorSendAiButton';
    send.className = 'rw-editor-ai';
    send.textContent = 'Send to AI';
    send.title = 'Insert this selected local file into ChatGPT, Claude, or Gemini. If no AI provider tab is active, RWACode routes to an existing provider tab or opens ChatGPT. RWACode does not press Send automatically.';
    send.onclick = sendFileToActiveAi;

    const importReply = document.createElement('button');
    importReply.id = 'editorImportAiButton';
    importReply.className = 'rw-editor-ai secondary';
    importReply.textContent = 'Import Reply';
    importReply.title = 'Import the latest assistant replacement into the review panel. The local file is not changed until Apply is confirmed.';
    importReply.onclick = () => importAiReply();

    editorHead.insertBefore(send, reveal);
    editorHead.insertBefore(importReply, reveal);
  }

  queueMicrotask(() => {
    api.browser.home().catch((error) => status(`Startup sync: ${error.message}`));
  });
})();