'use strict';

const api = window.rwacode;
const $ = (id) => document.getElementById(id);

const state = {
  root: '', profiles: [], activeProfileId: '', tabs: [], activeTabId: '',
  currentDir: '.', entries: [], selectedPath: null, editorPath: null, editorDirty: false,
  filter: '', previewLoaded: false, filesCollapsed: false, rightCollapsed: false, syncTimer: null,
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
  const isHome = url === 'rwacode://newtab' && !state.editorPath;
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
    if (!(await closeEditor(true))) return;
    const result = await api.files.read(relativePath);
    state.editorPath = result.path;
    state.editorDirty = false;
    await api.browser.setVisible(false);
    $('newTabPage').classList.add('hidden');
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
  await api.browser.setVisible(true);
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

async function fileAction(action) {
  try {
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
    await api.preview.load(url);
    state.previewLoaded = true;
    $('previewPlaceholder').classList.add('hidden');
    $('signalPreview').textContent = 'LIVE';
    updateBounds();
    status(`Preview · ${url}`);
  } catch (error) {
    $('signalPreview').textContent = 'ERROR';
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
    const profile = activeProfile(); if (!profile || !window.confirm(`Clear all site data for ${profile.name}? Other profiles are unaffected.`)) return;
    await api.profiles.clear(profile.id); status(`Cleared ${profile.name} site data`);
  };
  $('deleteProfileButton').onclick = async () => {
    if (!(await closeEditor(true))) return;
    const profile = activeProfile(); if (!profile || !window.confirm(`Delete browser profile ${profile.name}?`)) return;
    const result = await api.profiles.delete(profile.id); state.profiles = result.profiles; state.activeProfileId = result.activeProfileId; renderProfiles();
  };

  $('newTabButton').onclick = async () => { if (await closeEditor(true)) api.browser.newTab('rwacode://newtab'); };
  $('backButton').onclick = async () => { if (await closeEditor(true)) api.browser.back(); };
  $('forwardButton').onclick = async () => { if (await closeEditor(true)) api.browser.forward(); };
  $('reloadButton').onclick = async () => { if (await closeEditor(true)) api.browser.reload(); };
  $('homeButton').onclick = async () => { if (await closeEditor(true)) api.browser.navigate('rwacode://newtab'); };
  $('addressInput').onkeydown = async (event) => { if (event.key === 'Enter' && await closeEditor(true)) api.browser.navigate(event.currentTarget.value); };
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
    if (mod && event.key.toLowerCase() === 'l' && await closeEditor(true)) { event.preventDefault(); $('addressInput').focus(); $('addressInput').select(); }
    if (mod && event.key.toLowerCase() === 't' && await closeEditor(true)) { event.preventDefault(); api.browser.newTab('rwacode://newtab'); }
    if (mod && event.key.toLowerCase() === 'w') { event.preventDefault(); if (state.editorPath) await closeEditor(true); else if (state.activeTabId) api.browser.closeTab(state.activeTabId); }
    if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); setFilesCollapsed(false); $('fileSearch').classList.remove('hidden'); $('fileSearchInput').focus(); }
  });
}

api.browser.onTabs((payload) => {
  state.tabs = payload.tabs; state.activeTabId = payload.activeTabId; state.activeProfileId = payload.activeProfileId;
  renderTabs(); renderProfiles();
});
api.browser.onCrash(() => $('browserCrash').classList.remove('hidden'));
api.preview.onState((preview) => { $('signalPreview').textContent = preview.loading ? 'LOADING' : 'LIVE'; });
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
