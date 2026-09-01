'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createPathGuard } = require('../lib/path-guard.cjs');
const { createProjectContextEngine, isSensitivePath } = require('./project-context.cjs');

const SEARCH_MAX_FILES = 2600;
const SEARCH_MAX_FILE_BYTES = 512 * 1024;
const SEARCH_READ_BYTES = 96 * 1024;
const SKIP_DIRS = new Set(['.git','node_modules','dist','build','.next','.cache','coverage','vendor','target','__pycache__','.pytest_cache','.turbo','.parcel-cache','.idea','.gradle','.mypy_cache','.ruff_cache']);
const TEXT_EXTENSIONS = new Set(['js','jsx','ts','tsx','cjs','mjs','json','md','mdx','txt','css','scss','less','html','htm','xml','yaml','yml','toml','ini','py','go','rs','java','kt','kts','swift','sql','sh','bash','zsh','fish','vue','svelte','astro','rb','php','cs','cpp','cc','c','h','hpp','proto','graphql','gql','csv','tsv']);
const SPECIAL_NAMES = new Set(['AGENTS.md','AGENTS.override.md','RWACODE.md','CLAUDE.md','README.md','package.json','Dockerfile','Makefile','Procfile','LICENSE','NOTICE']);

function isSearchable(name) {
  if (isSensitivePath(name)) return false;
  if (SPECIAL_NAMES.has(name)) return true;
  return TEXT_EXTENSIONS.has(path.extname(name).slice(1).toLowerCase());
}

function createWorkspaceRetriever({ root }) {
  const guard = createPathGuard(root);
  const context = createProjectContextEngine({ root:guard.root });
  let fileCache = null;

  async function indexFiles() {
    if (fileCache) return fileCache;
    const files=[]; const queue=[{ relativeDir:'.', depth:0 }];
    const directoryPriority = (entry) => entry.name === '05_HANDOFF_EVIDENCE' ? 0 : entry.name === '07_RUNTIME' ? 1 : entry.name === 'rwacode' ? 2 : entry.name === 'src' ? 3 : 10;
    while (queue.length && files.length < SEARCH_MAX_FILES) {
      const { relativeDir, depth } = queue.shift(); if (depth > 9) continue;
      let entries=[]; try { entries = await fsp.readdir(guard.resolveExisting(relativeDir), { withFileTypes:true }); } catch { continue; }
      const localFiles = entries.filter((entry) => {
        const rel = path.join(relativeDir === '.' ? '' : relativeDir, entry.name);
        return entry.isFile() && entry.name !== '.DS_Store' && !isSensitivePath(rel) && isSearchable(entry.name);
      }).sort((a,b) => a.name.localeCompare(b.name));
      for (const entry of localFiles) {
        if (files.length >= SEARCH_MAX_FILES) break;
        const rel = path.join(relativeDir === '.' ? '' : relativeDir, entry.name);
        try {
          const absolute=guard.resolveExisting(rel); const stat=await fsp.stat(absolute);
          if (stat.size > 0 && stat.size <= SEARCH_MAX_FILE_BYTES) files.push({ path:rel, size:stat.size, mtimeMs:stat.mtimeMs });
        } catch {}
      }
      if (depth >= 9) continue;
      const localDirs = entries.filter((entry) => {
        const rel = path.join(relativeDir === '.' ? '' : relativeDir, entry.name);
        return entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !isSensitivePath(rel);
      }).sort((a,b) => directoryPriority(a) - directoryPriority(b) || a.name.localeCompare(b.name));
      for (const entry of localDirs) queue.push({ relativeDir:path.join(relativeDir === '.' ? '' : relativeDir, entry.name), depth:depth+1 });
    }
    fileCache=files; return files;
  }

  async function searchText(query, { limit=20 } = {}) {
    const needle=String(query || '').trim(); if (!needle) return [];
    const needleLower=needle.toLowerCase(); const results=[];
    for (const meta of await indexFiles()) {
      if (isSensitivePath(meta.path)) continue;
      try {
        const absolute=guard.resolveExisting(meta.path); const handle=await fsp.open(absolute,'r'); let content='';
        try {
          const max=Math.min(meta.size, SEARCH_READ_BYTES); const buffer=Buffer.alloc(max); const { bytesRead }=await handle.read(buffer,0,max,0);
          content=buffer.subarray(0,bytesRead).toString('utf8');
        } finally { await handle.close(); }
        const lower=content.toLowerCase(); const first=lower.indexOf(needleLower); if (first < 0) continue;
        let hits=0; let offset=first; while (offset >= 0 && hits < 25) { hits += 1; offset=lower.indexOf(needleLower, offset + needleLower.length); }
        results.push({ path:meta.path, hits, size:meta.size, mtimeMs:meta.mtimeMs });
      } catch {}
    }
    return results.sort((a,b) => b.hits-a.hits || b.mtimeMs-a.mtimeMs || a.path.localeCompare(b.path)).slice(0,Math.max(1,Math.min(Number(limit)||20,100)));
  }

  async function build(task) { return context.build(task); }
  function invalidate() { fileCache=null; context.invalidate(); }
  return { root:guard.root, build, searchText, invalidate };
}

module.exports = { createWorkspaceRetriever, isSearchable, SEARCH_MAX_FILES, SEARCH_MAX_FILE_BYTES, SEARCH_READ_BYTES };
