'use strict';

const api = window.rwacode;
const $ = (id) => document.getElementById(id);

const state = {
  root: '', profiles: [], activeProfileId: '', tabs: [], activeTabId: '',
  currentDir: '.', selectedPath: null, editorPath: null, filter: '', previewLoaded: false,
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
  const isHome = url === 'rwacode://newtab';
  $('newTabPage').classList.toggle('hidden', !isHome);
  updateBounds();
}

function toRelative(parent, name) { return parent === '.' ? name : `${parent}/${name}`; }

async function loadDirectory(relativePath = state.currentDir) {
  try {
    const result = await api.files.list(relativePath);
    state.currentDir = result.path;
    state.root = result.root;
    $('rootPath').textContent = result.root;
    $('workspaceChip').textContent = `⌁ ${result.root.split('/').filter(Boolean).at(-1) || 'workspace'}`;
    renderDirectory(result.entries);
    status(`Files · ${result.path}`);
  } catch (error) { status(`Files: ${error.message}`); }
}

function renderDirectory(entries) {
  const tree = $('fileTree');
  tree.innerHTML = '';
  const filter = state.filter.toLowerCase();
  if (state.currentDir !== '.') {
    const up = document.createElement('div');
    up.className = 'file-row';
    up.innerHTML = '<span class="file-icon">↰</span><span class="file-name">..</span>';
    up.onclick = () => loadDirectory(state.currentDir.split('/').slice(0, -1).join('/') || '.');
    tree.appendChild(up);
  }
  for (const entry of entries) {
    if (filter && !entry.name.toLowerCase().includes(filter)) continue;
    const row = document.createElement('div');
    row.className = `file-row ${state.selectedPath === entry.path ? 'selected' : ''}`;
    const icon = entry.type === 'directory' ? '▰' : entry.name.endsWith('.js') ? '●' : entry.name.endsWith('.ts') ? '◆' : entry.name.endsWith('.json') ? '◇' : '◫';
    row.innerHTML = `<span class="file-icon">${icon}</span><span class="file-name">${esc(entry.name)}</span><span class="file-path-hint">${entry.type === 'directory' ? 'folder' : ''}</span>`;
    row.onclick = () => { state.selectedPath = entry.path; renderDirectory(entries); };
    row.ondblclick = () => entry.type === 'directory' ? loadDirectory(entry.path) : openEditor(entry.path);
    tree.appendChild(row);
  }
}

async function openEditor(relativePath) {
  try {
    const result = await api.files.read(relativePath);
    state.editorPath = relativePath;
    $('editorTitle').textContent = relativePath;
    $('editorText').value = result.content;
    $('editorMeta').textContent = `${result.size} bytes · UTF-8`;
    $('editorDialog').showModal();
  } catch (error) { status(`Open file: ${error.message}`); }
}

async function fileAction(action) {
  try {
    if (action === 'new-file' || action === 'new-folder') {
      const name = window.prompt(action === 'new-file' ? 'New file name' : 'New folder name');
      if (!name) return;
      await api.files.create(state.currentDir, name, action === 'new-folder' ? 'directory' : 'file');
      await loadDirectory();
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
      await api.files.delete(state.selectedPath);
      state.selectedPath = null;
      await loadDirectory();
    }
  } catch (error) { status(`${action}: ${error.message}`); }
}

function updateBounds() {
  const browserRect = $('browserSurface').getBoundingClientRect();
  api.browser.setBounds({ x: browserRect.x, y: browserRect.y, width: browserRect.width, height: browserRect.height }).catch(() => {});
  const previewRect = $('previewSurface').getBoundingClientRect();
  api.preview.setBounds({ x: previewRect.x, y: previewRect.y, width: previewRect.width, height: previewRect.height }).catch(() => {});
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

function bindUi() {
  $('profileButton').onclick = () => $('profileMenu').classList.toggle('open');
  document.addEventListener('click', (event) => {
    if (!$('profileMenu').contains(event.target) && !$('profileButton').contains(event.target)) $('profileMenu').classList.remove('open');
  });
  $('addProfileButton').onclick = async () => {
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
    const profile = activeProfile(); if (!profile || !window.confirm(`Clear all site data for ${profile.name}? Other profiles are unaffected.`)) return;
    await api.profiles.clear(profile.id); status(`Cleared ${profile.name} site data`);
  };
  $('deleteProfileButton').onclick = async () => {
    const profile = activeProfile(); if (!profile || !window.confirm(`Delete browser profile ${profile.name}?`)) return;
    const result = await api.profiles.delete(profile.id); state.profiles = result.profiles; state.activeProfileId = result.activeProfileId; renderProfiles();
  };

  $('newTabButton').onclick = () => api.browser.newTab('rwacode://newtab');
  $('backButton').onclick = () => api.browser.back();
  $('forwardButton').onclick = () => api.browser.forward();
  $('reloadButton').onclick = () => api.browser.reload();
  $('homeButton').onclick = () => api.browser.navigate('rwacode://newtab');
  $('addressInput').onkeydown = (event) => { if (event.key === 'Enter') api.browser.navigate(event.currentTarget.value); };
  $('openExternalButton').onclick = () => api.browser.openExternal?.(activeTab()?.url || $('addressInput').value);
  $('browserMenuButton').onclick = () => status('Browser menu · profile controls are in the top-right profile menu');
  $('crashReloadButton').onclick = () => { $('browserCrash').classList.add('hidden'); api.browser.reload(); };
  document.querySelectorAll('.provider-card').forEach((button) => button.onclick = () => api.browser.navigate(button.dataset.url));

  $('fileRefreshButton').onclick = () => loadDirectory();
  $('fileSearchButton').onclick = () => { $('fileSearch').classList.toggle('hidden'); if (!$('fileSearch').classList.contains('hidden')) $('fileSearchInput').focus(); };
  $('fileSearchInput').oninput = async (event) => { state.filter = event.target.value; await loadDirectory(); };
  $('fileMoreButton').onclick = () => $('fileActions').classList.toggle('hidden');
  document.querySelectorAll('#fileActions button').forEach((button) => button.onclick = () => fileAction(button.dataset.action));

  $('editorSaveButton').onclick = async (event) => {
    event.preventDefault();
    if (!state.editorPath) return;
    try { await api.files.write(state.editorPath, $('editorText').value); $('editorDialog').close(); status(`Saved ${state.editorPath}`); await loadDirectory(); }
    catch (error) { status(`Save: ${error.message}`); }
  };

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
  document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'l') { event.preventDefault(); $('addressInput').focus(); $('addressInput').select(); }
    if (mod && event.key.toLowerCase() === 't') { event.preventDefault(); api.browser.newTab('rwacode://newtab'); }
    if (mod && event.key.toLowerCase() === 'w') { event.preventDefault(); if (state.activeTabId) api.browser.closeTab(state.activeTabId); }
    if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); $('fileSearch').classList.remove('hidden'); $('fileSearchInput').focus(); }
  });
}

api.browser.onTabs((payload) => {
  state.tabs = payload.tabs; state.activeTabId = payload.activeTabId; state.activeProfileId = payload.activeProfileId;
  renderTabs(); renderProfiles();
});
api.browser.onCrash(() => $('browserCrash').classList.remove('hidden'));
api.preview.onState((preview) => { $('signalPreview').textContent = preview.loading ? 'LOADING' : 'LIVE'; });

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
