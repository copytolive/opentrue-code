'use strict';

const api = window.rwacode;
const $ = (id) => document.getElementById(id);

const state = {
  root: '', profiles: [], activeProfileId: '', tabs: [], activeTabId: '',
  currentDir: '.', entries: [], selectedPath: null, editorPath: null, editorDirty: false,
  filter: '', previewLoaded: false, filesCollapsed: false, rightCollapsed: false, syncTimer: null,
  proposalPath: null, proposalProvider: null,
};

function status(message) { $('statusMessage').textContent = message; }
function activeProfile() { return state.profiles.find((p) => p.id === state.activeProfileId); }
function activeTab() { return state.tabs.find((tab) => tab.id === state.activeTabId); }
function letter(name) { return (String(name || 'P').trim()[0] || 'P').toUpperCase(); }
function esc(text) { return String(text).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function renderProfiles() {
  const list = $('profileList');
  list.innerHTML = '';
  for (const profile of state.profiles) {
    const button = document.createElement('button');
    button.className = 'profile-item';
    button.innerHTML = `<span class="avatar">${esc(letter(profile.name))}</span><div><b>${esc(profile.name)}</b><small>${profile.id === state.activeProfileId ? 'Active browser profile' : 'Persistent isolated session'}</small></div>`;
    button.onclick = async () => {
      try {
        if (!(await closeEditor(true))) return;
        if (state.proposalPath) await cancelProposal();
        const result = await api.profiles.activate(profile.id);
        state.activeProfileId = result.activeProfileId;
        $('profileMenu').classList.remove('open');
        await refreshProfiles();
        status(`Switched to ${profile.name}`);
      } catch (error) { status(error.message); }
    };
    list.appendChild(button);
  }
  const profile = activeProfile();
  if (profile) {
    $('profileAvatar').textContent = letter(profile.name);
    $('profileName').textContent = profile.name;
    $('signalProfile').textContent = profile.name.toUpperCase();
    $('statusProfile').textContent = profile.name;
  }
}

async function refreshProfiles() {
  const result = await api.profiles.list();
  state.profiles = result.profiles;
  state.activeProfileId = result.activeProfileId;
  renderProfiles();
}

function renderTabs() {
  const host = $('tabs');
  host.innerHTML = '';
  for (const tab of state.tabs) {
    const button = document.createElement('button');
    button.className = `tab ${tab.id === state.activeTabId ? 'active' : ''}`;
    const home = tab.url === 'rwacode://newtab';
    const title = home ? 'New Tab' : (tab.title || tab.url || 'Tab');
    button.innerHTML = `<span class="tab-loading">${tab.loading ? '◌' : 'R'}</span><span class="tab-title">${esc(title)}</span><span class="tab-close" title="Close">×</span>`;
    button.onclick = async (event) => {
      if (!(await closeEditor(true))) return;
      if (state.proposalPath) await cancelProposal();
      if (event.target.classList.contains('tab-close')) {
        event.stopPropagation();
        await api.browser.closeTab(tab.id);
        return;
      }
      await api.browser.switchTab(tab.id);
    };
    host.appendChild(button);
  }
  syncActiveTabUi();
}

function syncActiveTabUi() {
  const tab = activeTab();
  const url = tab?.url || 'rwacode://newtab';
  $('addressInput').value = url;
  $('backButton').disabled = !tab?.canGoBack;
  $('forwardButton').disabled = !tab?.canGoForward;
  const isHome = url === 'rwacode://newtab' && !state.editorPath && !state.proposalPath;
  $('newTabPage').classList.toggle('hidden', !isHome);
  updateBounds();
}

async function loadDirectory(relativePath = state.currentDir, quiet = false) {
  try {
    const result = await api.files.list(relativePath);
    state.currentDir = result.path;
    state.root = result.root;
    state.entries = result.entries;
    $('rootPath').textContent = result.root;
    $('workspaceChip').textContent = `⌁ ${result.root.split('/').filter(Boolean).at(-1) || 'workspace'}`;
    $('fileBreadcrumb').textContent = result.path === '.' ? './' : `./${result.path}`;
    renderDirectory();
    if (!quiet) status(`Files · ${result.path}`);
  } catch (error) { status(`Files: ${error.message}`); }
}

function selectEntry(pathValue) {
  state.selectedPath = pathValue;
  renderDirectory();
}

function renderDirectory() {
  const tree = $('fileTree');
  tree.innerHTML = '';
  const filter = state.filter.toLowerCase();
  if (state.currentDir !== '.') {
    const up = document.createElement('div');
    up.className = 'file-row file-up';
    up.innerHTML = '<span class="file-icon">↰</span><span class="file-name">..</span><span class="file-path-hint">parent</span>';
    up.onclick = () => loadDirectory(state.currentDir.split('/').slice(0, -1).join('/') || '.');
    tree.appendChild(up);
  }
  for (const entry of state.entries) {
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;
    const row = document.createElement('div');
    row.className = `file-row ${state.selectedPath === entry.path ? 'selected' : ''}`;
    row.dataset.path = entry.path;
    row.dataset.type = entry.type;
    const icon = entry.type === 'directory' ? '▰' : entry.name.endsWith('.js') ? '●' : entry.name.endsWith('.ts') ? '◆' : entry.name.endsWith('.json') ? '◇' : '◫';
    row.innerHTML = `<span class="file-icon">${icon}</span><span class="file-name">${esc(entry.name)}</span><span class="file-path-hint">${entry.type === 'directory' ? 'folder' : 'file'}</span><button class="file-row-more" title="Select for file actions">⋯</button>`;
    row.onclick = async (event) => {
      if (event.target.closest('.file-row-more')) return;
      state.selectedPath = entry.path;
      if (entry.type === 'directory') await loadDirectory(entry.path);
      else if (entry.type === 'file') await openEditor(entry.path);
      else { renderDirectory(); status(`Unsupported entry · ${entry.path}`); }
    };
    row.oncontextmenu = (event) => {
      event.preventDefault();
      selectEntry(entry.path);
      $('fileActions').classList.remove('hidden');
    };
    row.querySelector('.file-row-more').onclick = (event) => {
      event.stopPropagation();
      selectEntry(entry.path);
      $('fileActions').classList.remove('hidden');
    };
    tree.appendChild(row);
  }
  if (!tree.children.length) {
    const empty = document.createElement('div');
    empty.className = 'file-empty';
    empty.textContent = filter ? 'No matching files in this folder.' : 'This folder is empty.';
    tree.appendChild(empty);
  }
}

async function openEditor(relativePath) {
  try {
    if (state.proposalPath) await cancelProposal();
    if (!(await closeEditor(true))) return;
    const result = await api.files.read(relativePath);
    state.selectedPath = result.path;
    state.editorPath = result.path;
    state.editorDirty = false;
    await api.browser.setVisible(false);
    $('newTabPage').classList.add('hidden');
    $('proposalPanel').classList.add('hidden');
    $('editorPanel').classList.remove('hidden');
    $('editorTitle').textContent = result.path;
    $('editorText').value = result.content;
    $('editorMeta').textContent = `${result.size} bytes · UTF-8 · root locked`;
    $('editorDirty').classList.add('hidden');
    $('editorText').focus();
    status(`Local file · ${result.path}`);
  } catch (error) {
    state.editorPath = null;
    await api.browser.setVisible(true).catch(() => {});
    status(`Open file: ${error.message}`);
  }
}

async function closeEditor(confirmDirty = false) {
  if (!state.editorPath) return true;
  if (confirmDirty && state.editorDirty && !window.confirm(`Discard unsaved changes to ${state.editorPath}?`)) return false;
  state.editorPath = null;
  state.editorDirty = false;
  $('editorPanel').classList.add('hidden');
  $('editorDirty').classList.add('hidden');
  if (!state.proposalPath) await api.browser.setVisible(true);
  syncActiveTabUi();
  return true;
}

async function saveEditor() {
  if (!state.editorPath) return;
  try {
    const result = await api.files.write(state.editorPath, $('editorText').value);
    state.editorDirty = false;
    $('editorDirty').classList.add('hidden');
    $('editorMeta').textContent = `${result.size} bytes · UTF-8 · saved`;
    status(`Saved ${result.path}`);
    await loadDirectory(state.currentDir, true);
  } catch (error) { status(`Save: ${error.message}`); }
}

function extractReplacement(text) {
  const source = String(text || '').trim();
  const blocks = [];
  const regex = /```[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(source))) blocks.push(match[1].replace(/\n$/, ''));
  if (!blocks.length) return { content: source, fenced: false };
  blocks.sort((a, b) => b.length - a.length);
  return { content: blocks[0], fenced: true };
}

async function sendSelectedToAi() {
  const target = state.editorPath || state.selectedPath;
  if (!target) { status('AI bridge: select a local file first'); return; }
  try {
    if (state.editorPath === target && state.editorDirty) await saveEditor();
    if (state.editorPath && !(await closeEditor(false))) return;
    if (state.proposalPath) await cancelProposal();
    const instruction = window.prompt('Instruction for the active AI about this local file', 'Read this file and explain it. If changes are needed, return the complete replacement file in one fenced code block.');
    if (instruction === null) return;
    $('signalAiBridge').textContent = 'SENDING';
    $('aiBridgeBadge').textContent = 'AI BRIDGE · SENDING';
    const result = await api.ai.sendFile(target, instruction);
    $('fileActions').classList.add('hidden');
    $('signalAiBridge').textContent = result.submitted ? 'SENT' : 'COMPOSER';
    $('aiBridgeBadge').textContent = `AI BRIDGE · ${result.provider.toUpperCase()}`;
    status(result.submitted
      ? `Sent ${target} to ${result.provider} · only this file was shared`
      : `${result.provider}: local context inserted into composer; press Send manually`);
  } catch (error) {
    $('signalAiBridge').textContent = 'ERROR';
    $('aiBridgeBadge').textContent = 'AI BRIDGE · ERROR';
    status(`AI bridge: ${error.message}`);
  }
}

async function importAiReply() {
  const target = state.editorPath || state.selectedPath;
  if (!target) { status('AI bridge: select the target local file first'); return; }
  try {
    if (state.editorPath === target && state.editorDirty) await saveEditor();
    if (state.editorPath) await closeEditor(false);
    $('signalAiBridge').textContent = 'IMPORT';
    $('aiBridgeBadge').textContent = 'AI BRIDGE · IMPORTING';
    const result = await api.ai.readReply();
    const proposal = extractReplacement(result.text);
    state.proposalPath = target;
    state.proposalProvider = result.provider;
    await api.browser.setVisible(false);
    $('newTabPage').classList.add('hidden');
    $('editorPanel').classList.add('hidden');
    $('proposalPanel').classList.remove('hidden');
    $('proposalPath').textContent = target;
    $('proposalProvider').textContent = `${result.provider} · latest assistant reply`;
    $('proposalText').value = proposal.content;
    $('proposalMeta').textContent = proposal.fenced
      ? 'Complete fenced replacement detected. Review every line before Apply.'
      : 'No fenced replacement was detected. The full assistant reply is shown; review carefully before Apply.';
    $('signalAiBridge').textContent = 'REVIEW';
    $('aiBridgeBadge').textContent = `AI BRIDGE · REVIEW ${result.provider.toUpperCase()}`;
    $('fileActions').classList.add('hidden');
    status(`AI proposal imported from ${result.provider} · no local file changed yet`);
  } catch (error) {
    $('signalAiBridge').textContent = 'ERROR';
    $('aiBridgeBadge').textContent = 'AI BRIDGE · ERROR';
    status(`Import AI reply: ${error.message}`);
  }
}

async function cancelProposal() {
  state.proposalPath = null;
  state.proposalProvider = null;
  $('proposalPanel').classList.add('hidden');
  $('proposalText').value = '';
  $('signalAiBridge').textContent = 'READY';
  $('aiBridgeBadge').textContent = 'AI BRIDGE READY';
  await api.browser.setVisible(true);
  syncActiveTabUi();
}

async function applyProposal() {
  if (!state.proposalPath) return;
  const target = state.proposalPath;
  const content = $('proposalText').value;
  if (!window.confirm(`Replace ${target} with the reviewed AI proposal?`)) return;
  try {
    const result = await api.files.write(target, content);
    state.proposalPath = null;
    state.proposalProvider = null;
    $('proposalPanel').classList.add('hidden');
    $('signalAiBridge').textContent = 'APPLIED';
    $('aiBridgeBadge').textContent = 'AI BRIDGE · APPLIED';
    state.selectedPath = target;
    await loadDirectory(state.currentDir, true);
    await openEditor(result.path);
    status(`Applied reviewed AI replacement · ${result.path}`);
  } catch (error) {
    $('signalAiBridge').textContent = 'ERROR';
    status(`Apply AI proposal: ${error.message}`);
  }
}

async function fileAction(action) {
  try {
    if (action === 'ai-send') { await sendSelectedToAi(); return; }
    if (action === 'ai-import') { await importAiReply(); return; }
    if (action === 'new-file' || action === 'new-folder') {
      const name = window.prompt(action === 'new-file' ? 'New file name' : 'New folder name');
      if (!name) return;
      await api.files.create(state.currentDir, name, action === 'new-folder' ? 'directory' : 'file');
      await loadDirectory();
      $('fileActions').classList.add('hidden');
      return;
    }
    if (!state.selectedPath) { status('Select a file or folder first'); return; }
    if (action === 'reveal') await api.files.reveal(state.selectedPath);
    if (action === 'rename') {
      const currentName = state.selectedPath.split('/').at(-1);
      const name = window.prompt('Rename to', currentName);
      if (!name || name === currentName) return;
      await api.files.rename(state.selectedPath, name);
      state.selectedPath = null;
      await loadDirectory();
    }
    if (action === 'delete') {
      const confirmed = await api.files.confirmDelete(state.selectedPath);
      if (!confirmed) return;
      if (state.editorPath === state.selectedPath) await closeEditor(false);
      await api.files.delete(state.selectedPath);
      state.selectedPath = null;
      await loadDirectory();
    }
    $('fileActions').classList.add('hidden');
  } catch (error) { status(`${action}: ${error.message}`); }
}

function updateBounds() {
  const browserRect = $('browserSurface').getBoundingClientRect();
  api.browser.setBounds({ x: browserRect.x, y: browserRect.y, width: browserRect.width, height: browserRect.height }).catch(() => {});
  const previewRect = $('previewSurface').getBoundingClientRect();
  const bounds = state.rightCollapsed || previewRect.width < 2 || previewRect.height < 2
    ? { x: 0, y: 0, width: 1, height: 1 }
    : { x: previewRect.x, y: previewRect.y, width: previewRect.width, height: previewRect.height };
  api.preview.setBounds(bounds).catch(() => {});
}

async function loadPreview() {
  try {
    const url = $('previewUrlInput').value.trim();
    state.previewLoaded = true;
    $('signalPreview').textContent = 'LOADING';
    status(`Preview loading · ${url}`);
    await api.preview.load(url);
    updateBounds();
  } catch (error) {
    state.previewLoaded = false;
    $('signalPreview').textContent = 'ERROR';
    $('previewPlaceholder').classList.remove('hidden');
    status(`Preview: ${error.message}`);
  }
}

function setFilesCollapsed(collapsed) {
  state.filesCollapsed = collapsed;
  document.body.classList.toggle('files-collapsed', collapsed);
  $('filesCollapseButton').textContent = collapsed ? '▸' : '◂';
  $('filesCollapseButton').title = collapsed ? 'Expand Local Files' : 'Collapse Local Files';
  requestAnimationFrame(updateBounds);
}
function setRightCollapsed(collapsed) {
  state.rightCollapsed = collapsed;
  document.body.classList.toggle('right-collapsed', collapsed);
  $('rightCollapseButton').textContent = collapsed ? '◂' : '▸';
  $('rightCollapseButton').title = collapsed ? 'Expand Preview' : 'Collapse Preview';
  requestAnimationFrame(updateBounds);
}

function bindUi() {
  $('profileButton').onclick = () => $('profileMenu').classList.toggle('open');
  document.addEventListener('click', (event) => {
    if (!$('profileMenu').contains(event.target) && !$('profileButton').contains(event.target)) $('profileMenu').classList.remove('open');
    if (!$('fileActions').contains(event.target) && event.target !== $('fileMoreButton') && !event.target.closest?.('.file-row-more')) $('fileActions').classList.add('hidden');
  });
  $('addProfileButton').onclick = async () => {
    if (!(await closeEditor(true))) return;
    if (state.proposalPath) await cancelProposal();
    const name = window.prompt('New browser profile name');
    if (!name) return;
    const result = await api.profiles.add(name);
    state.profiles = result.profiles; state.activeProfileId = result.activeProfileId; renderProfiles();
  };
  $('renameProfileButton').onclick = async () => {
    const profile = activeProfile(); if (!profile) return;
    const name = window.prompt('Rename browser profile', profile.name); if (!name) return;
    const result = await api.profiles.rename(profile.id, name); state.profiles = result.profiles; renderProfiles();
  };
  $('clearProfileButton').onclick = async () => {
    if (!(await closeEditor(true))) return;
    if (state.proposalPath) await cancelProposal();
    const profile = activeProfile(); if (!profile || !window.confirm(`Clear all site data for ${profile.name}? Other profiles are unaffected.`)) return;
    await api.profiles.clear(profile.id); status(`Cleared ${profile.name} site data`);
  };
  $('deleteProfileButton').onclick = async () => {
    if (!(await closeEditor(true))) return;
    if (state.proposalPath) await cancelProposal();
    const profile = activeProfile(); if (!profile || !window.confirm(`Delete browser profile ${profile.name}?`)) return;
    const result = await api.profiles.delete(profile.id); state.profiles = result.profiles; state.activeProfileId = result.activeProfileId; renderProfiles();
  };

  $('newTabButton').onclick = async () => { if (await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); api.browser.newTab('rwacode://newtab'); } };
  $('backButton').onclick = async () => { if (await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); api.browser.back(); } };
  $('forwardButton').onclick = async () => { if (await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); api.browser.forward(); } };
  $('reloadButton').onclick = async () => { if (await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); api.browser.reload(); } };
  $('homeButton').onclick = async () => { if (await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); api.browser.navigate('rwacode://newtab'); } };
  $('addressInput').onkeydown = async (event) => { if (event.key === 'Enter' && await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); api.browser.navigate(event.currentTarget.value); } };
  $('openExternalButton').onclick = () => api.browser.openExternal?.(activeTab()?.url || $('addressInput').value);
  $('crashReloadButton').onclick = () => { $('browserCrash').classList.add('hidden'); api.browser.reload(); };
  document.querySelectorAll('.provider-card').forEach((button) => button.onclick = () => api.browser.navigate(button.dataset.url));

  $('filesCollapseButton').onclick = () => setFilesCollapsed(!state.filesCollapsed);
  $('rightCollapseButton').onclick = () => setRightCollapsed(!state.rightCollapsed);
  $('fileRefreshButton').onclick = () => loadDirectory();
  $('fileSearchButton').onclick = () => { $('fileSearch').classList.toggle('hidden'); if (!$('fileSearch').classList.contains('hidden')) $('fileSearchInput').focus(); };
  $('fileSearchInput').oninput = (event) => { state.filter = event.target.value; renderDirectory(); };
  $('fileMoreButton').onclick = (event) => { event.stopPropagation(); $('fileActions').classList.toggle('hidden'); };
  document.querySelectorAll('#fileActions button').forEach((button) => button.onclick = () => fileAction(button.dataset.action));

  $('editorText').oninput = () => { state.editorDirty = true; $('editorDirty').classList.remove('hidden'); };
  $('editorSaveButton').onclick = saveEditor;
  $('editorCloseButton').onclick = () => closeEditor(true);
  $('editorRevealButton').onclick = () => state.editorPath && api.files.reveal(state.editorPath);

  $('proposalCancelButton').onclick = cancelProposal;
  $('proposalApplyButton').onclick = applyProposal;
  $('proposalRevealButton').onclick = () => state.proposalPath && api.files.reveal(state.proposalPath);

  $('previewGoButton').onclick = loadPreview;
  $('previewUrlInput').onkeydown = (event) => { if (event.key === 'Enter') loadPreview(); };
  $('previewReloadButton').onclick = () => api.preview.reload();
  $('previewExternalButton').onclick = () => api.preview.openExternal();
  document.querySelectorAll('.device-button').forEach((button) => button.onclick = () => {
    document.querySelectorAll('.device-button').forEach((candidate) => candidate.classList.remove('active'));
    button.classList.add('active');
    $('previewSurface').classList.remove('tablet', 'mobile');
    if (button.dataset.device !== 'desktop') $('previewSurface').classList.add(button.dataset.device);
    requestAnimationFrame(updateBounds);
  });

  window.addEventListener('resize', updateBounds);
  api.app.onResize(() => setTimeout(updateBounds, 50));
  document.addEventListener('keydown', async (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 's' && state.editorPath) { event.preventDefault(); await saveEditor(); }
    if (mod && event.key.toLowerCase() === 'l' && await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); event.preventDefault(); $('addressInput').focus(); $('addressInput').select(); }
    if (mod && event.key.toLowerCase() === 't' && await closeEditor(true)) { if (state.proposalPath) await cancelProposal(); event.preventDefault(); api.browser.newTab('rwacode://newtab'); }
    if (mod && event.key.toLowerCase() === 'w') { event.preventDefault(); if (state.proposalPath) await cancelProposal(); else if (state.editorPath) await closeEditor(true); else if (state.activeTabId) api.browser.closeTab(state.activeTabId); }
    if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); setFilesCollapsed(false); $('fileSearch').classList.remove('hidden'); $('fileSearchInput').focus(); }
  });
}

api.browser.onTabs((payload) => {
  state.tabs = payload.tabs; state.activeTabId = payload.activeTabId; state.activeProfileId = payload.activeProfileId;
  renderTabs(); renderProfiles();
});
api.browser.onCrash(() => $('browserCrash').classList.remove('hidden'));
api.preview.onState((preview) => {
  const next = preview.state || (preview.loading ? 'LOADING' : 'IDLE');
  $('signalPreview').textContent = next;
  if (next === 'LIVE') {
    state.previewLoaded = true;
    $('previewPlaceholder').classList.add('hidden');
    status(`Preview live · ${preview.url || $('previewUrlInput').value}`);
  } else if (next === 'IDLE') {
    state.previewLoaded = false;
    $('previewPlaceholder').classList.remove('hidden');
  } else if (next === 'ERROR') {
    $('previewPlaceholder').classList.remove('hidden');
    status(`Preview error · ${preview.description || preview.url || 'load failed'}`);
  }
});
api.files.onChanged((change) => {
  $('fileSyncState').textContent = 'SYNC';
  $('signalFileSync').textContent = 'SYNC';
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(async () => {
    await loadDirectory(state.currentDir, true);
    if (state.editorPath && !state.editorDirty && change?.path === state.editorPath) {
      try {
        const fresh = await api.files.read(state.editorPath);
        $('editorText').value = fresh.content;
        $('editorMeta').textContent = `${fresh.size} bytes · UTF-8 · synced`;
      } catch {}
    }
    $('fileSyncState').textContent = 'LIVE';
    $('signalFileSync').textContent = 'LIVE';
    status(change?.path ? `Synced · ${change.path}` : 'Workspace synchronized');
  }, 180);
});
api.files.onWatchError((error) => {
  $('fileSyncState').textContent = 'ERROR';
  $('signalFileSync').textContent = 'ERROR';
  status(`File sync: ${error.message}`);
});

(async function boot() {
  bindUi();
  try {
    const appState = await api.app.getState();
    state.root = appState.root; state.profiles = appState.profiles; state.activeProfileId = appState.activeProfileId;
    $('rootPath').textContent = appState.root;
    renderProfiles();
    await loadDirectory('.');
    requestAnimationFrame(updateBounds);
    status(`RWACode ${appState.version} · ready`);
  } catch (error) { status(`Startup: ${error.message}`); }
})();
