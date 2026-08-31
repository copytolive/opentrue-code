'use strict';

(() => {
  const api = window.rwacode;
  const tree = document.getElementById('fileTree');
  const legacyMenu = document.getElementById('fileActions');
  const address = document.getElementById('addressInput');
  if (!api?.explorer?.showContextMenu || !api?.ai?.sendFile || !tree || !legacyMenu) return;

  const TEXT_EXTENSIONS = new Set([
    'js','jsx','ts','tsx','cjs','mjs','json','md','mdx','txt','css','scss','less','html','htm','xml',
    'yaml','yml','toml','ini','env','py','go','rs','java','kt','kts','swift','sql','sh','bash','zsh','fish',
    'vue','svelte','astro','rb','php','cs','cpp','cc','c','h','hpp','proto','graphql','gql','csv','tsv',
  ]);
  const SKIP_FOLDERS = new Set(['node_modules','dist','build','.next','.cache','coverage','vendor','.git']);
  const MAX_FOLDER_FILES = 8;
  const MAX_FOLDER_BYTES = 160 * 1024;

  legacyMenu.classList.add('hidden');
  legacyMenu.setAttribute('aria-hidden', 'true');

  function setStatus(message) {
    try { if (typeof status === 'function') status(message); } catch {}
  }

  function providerFromUrl(value) {
    try {
      const host = new URL(String(value || '')).hostname.toLowerCase();
      if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'ChatGPT';
      if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
      if (host === 'gemini.google.com') return 'Gemini';
    } catch {}
    return null;
  }

  function selectRow(row) {
    for (const candidate of tree.querySelectorAll('.file-row.selected')) candidate.classList.remove('selected');
    row.classList.add('selected');
    try {
      if (typeof state !== 'undefined') state.selectedPath = row.dataset.path || null;
    } catch {}
  }

  function extensionOf(name = '') {
    const part = String(name).split('.').pop();
    return String(part === name ? '' : part).toLowerCase();
  }

  function isTextCandidate(name = '') {
    if (!name.includes('.')) return /^(Dockerfile|Makefile|Procfile|LICENSE|NOTICE|README)$/i.test(name);
    return TEXT_EXTENSIONS.has(extensionOf(name));
  }

  async function ensureProvider() {
    const current = providerFromUrl(address?.value);
    if (current) {
      await api.browser.setVisible(true);
      return current;
    }

    try {
      if (typeof state !== 'undefined') {
        const existing = [...(state.tabs || [])].reverse().find((tab) => providerFromUrl(tab.url));
        if (existing) {
          await api.browser.switchTab(existing.id);
          await api.browser.setVisible(true);
          return providerFromUrl(existing.url);
        }
      }
    } catch {}

    await api.browser.newTab('https://chatgpt.com/');
    await api.browser.setVisible(true);
    return 'ChatGPT';
  }

  async function collectFolderFiles(folderPath, depth = 0, aggregate = { paths: [], bytes: 0 }) {
    if (aggregate.paths.length >= MAX_FOLDER_FILES || aggregate.bytes >= MAX_FOLDER_BYTES || depth > 5) return aggregate;
    const listing = await api.files.list(folderPath);
    for (const entry of listing.entries || []) {
      if (aggregate.paths.length >= MAX_FOLDER_FILES || aggregate.bytes >= MAX_FOLDER_BYTES) break;
      if (entry.type === 'directory') {
        if (SKIP_FOLDERS.has(entry.name) || entry.name.startsWith('.')) continue;
        await collectFolderFiles(entry.path, depth + 1, aggregate);
        continue;
      }
      if (entry.type !== 'file' || !isTextCandidate(entry.name)) continue;
      try {
        const file = await api.files.read(entry.path);
        if (file.size <= 0 || aggregate.bytes + file.size > MAX_FOLDER_BYTES) continue;
        aggregate.paths.push(file.path);
        aggregate.bytes += file.size;
      } catch {}
    }
    return aggregate;
  }

  let contextRevision = 0;
  let contextTimer = 0;

  function scheduleActiveContext(row) {
    const relativePath = row.dataset.path || '';
    const type = row.dataset.type || '';
    const name = row.querySelector('.file-name')?.textContent?.trim() || relativePath.split('/').at(-1) || relativePath;
    const revision = ++contextRevision;
    clearTimeout(contextTimer);

    contextTimer = setTimeout(async () => {
      try {
        const provider = await ensureProvider();
        if (revision !== contextRevision) return;

        if (type === 'directory') {
          const bundle = await collectFolderFiles(relativePath);
          if (revision !== contextRevision) return;
          if (!bundle.paths.length) {
            setStatus(`Local context · ${relativePath} has no supported text/code files`);
            return;
          }
          const result = await api.ai.sendFile(
            bundle.paths,
            `This is the active local folder context selected in RWACode: ${relativePath}. Use the supplied file contents for the next user message. Do not answer or submit anything yet; wait for the user to press Send.`,
          );
          if (revision !== contextRevision) return;
          setStatus(`${provider} · active local context ${name} · ${result.fileCount || bundle.paths.length} files ready`);
          return;
        }

        if (type === 'file') {
          if (!isTextCandidate(name)) {
            setStatus(`Local context · ${relativePath} is not a supported text/code file`);
            return;
          }
          const result = await api.ai.sendFile(
            relativePath,
            `This is the active local file selected in RWACode: ${relativePath}. Use its contents for the next user message. Do not answer or submit anything yet; wait for the user to press Send.`,
          );
          if (revision !== contextRevision) return;
          setStatus(`${provider} · active local context ${name} ready`);
        }
      } catch (error) {
        if (revision !== contextRevision) return;
        setStatus(`Local context: ${error?.message || String(error)}`);
      }
    }, 120);
  }

  function proxyAction(action, row) {
    if (!action || !row?.isConnected) return;
    selectRow(row);
    const source = legacyMenu.querySelector(`[data-real-action="${action}"]`);
    if (!source) {
      setStatus(`Explorer action unavailable: ${action}`);
      return;
    }
    source.disabled = false;
    source.click();
  }

  // Primary workflow: one left click selects local context and keeps the browser visible.
  // Folder clicks also navigate into the folder. File editing is an explicit double click.
  tree.addEventListener('click', (event) => {
    if (event.button !== 0 || event.target.closest('.file-row-more')) return;
    const row = event.target.closest('.file-row[data-path]');
    if (!row) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    selectRow(row);
    scheduleActiveContext(row);

    if (row.dataset.type === 'directory') {
      try {
        if (typeof loadDirectory === 'function') loadDirectory(row.dataset.path).catch((error) => setStatus(`Files: ${error.message}`));
      } catch (error) {
        setStatus(`Files: ${error?.message || String(error)}`);
      }
    }
  }, true);

  tree.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.file-row[data-path][data-type="file"]');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectRow(row);
    try {
      if (typeof openEditor === 'function') openEditor(row.dataset.path).catch((error) => setStatus(`Open file: ${error.message}`));
    } catch (error) {
      setStatus(`Open file: ${error?.message || String(error)}`);
    }
  }, true);

  // Secondary workflow: native macOS context menu only on a real file/folder row.
  tree.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.file-row[data-path]');
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!row) return;
    selectRow(row);
    const relativePath = row.dataset.path || '';

    api.explorer.showContextMenu(relativePath)
      .then((result) => {
        if (result?.action) proxyAction(result.action, row);
      })
      .catch((error) => {
        setStatus(`Explorer menu: ${error?.message || String(error)}`);
      });
  }, true);
})();
