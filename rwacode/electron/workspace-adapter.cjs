'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { createPathGuard } = require('../lib/path-guard.cjs');

const MAX_AGENT_FILE_BYTES = 2 * 1024 * 1024;

function normalizeRelative(value) {
  const raw=String(value || '').trim().replace(/\\/g,'/');
  if (!raw || raw==='.' || raw.startsWith('/') || raw.split('/').includes('..')) throw new Error('invalid workspace-relative path');
  return raw.replace(/^\.\//,'');
}
function normalizeDirectoryRelative(value) {
  const raw=String(value == null ? '.' : value).trim().replace(/\\/g,'/');
  if (!raw || raw==='.') return '.';
  if (raw.startsWith('/') || raw.split('/').includes('..')) throw new Error('invalid workspace-relative directory');
  return raw.replace(/^\.\//,'').replace(/\/$/,'') || '.';
}
function digest(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function createLocalWorkspaceAdapter({ root }) {
  const guard=createPathGuard(root);
  function lexicalAbsolute(relativePath) {
    const rel=normalizeRelative(relativePath); const candidate=path.resolve(guard.root,rel);
    if (candidate===guard.root || !candidate.startsWith(guard.root+path.sep)) throw new Error('path escapes canonical root');
    return {rel,candidate};
  }
  async function ensureSafeParents(relativePath,{createMissing=false}={}) {
    const rel=normalizeRelative(relativePath); const parentRel=path.dirname(rel); if (parentRel==='.') return [];
    const segments=parentRel.split('/').filter(Boolean); let current=guard.root; const created=[];
    for (let i=0;i<segments.length;i++) {
      current=path.join(current,segments[i]);
      try {
        const st=await fsp.lstat(current); if (st.isSymbolicLink()) throw new Error('symlink parent is not allowed'); if (!st.isDirectory()) throw new Error('workspace parent path is not a directory');
      } catch (error) {
        if (error?.code!=='ENOENT') throw error;
        if (!createMissing) break;
        await fsp.mkdir(current,{mode:0o700});
        created.push(path.relative(guard.root,current).replace(/\\/g,'/'));
      }
    }
    return created;
  }
  async function listDirectory(relativePath='.') {
    const rel=normalizeDirectoryRelative(relativePath); const target=guard.resolveExisting(rel); const stat=await fsp.stat(target); if (!stat.isDirectory()) throw new Error('workspace browse path is not a directory');
    const entries=await fsp.readdir(target,{withFileTypes:true}); const results=[];
    for (const entry of entries.sort((a,b)=>a.isDirectory()!==b.isDirectory()?(a.isDirectory()?-1:1):a.name.localeCompare(b.name))) {
      if (entry.name==='.git' || entry.name==='.DS_Store') continue; const absolute=path.join(target,entry.name);
      try { const lst=await fsp.lstat(absolute); if (lst.isSymbolicLink()) continue; const resolved=guard.resolveExisting(path.relative(guard.root,absolute)||'.'); if (resolved!==guard.root && !resolved.startsWith(guard.root+path.sep)) continue; results.push({name:entry.name,path:path.relative(guard.root,absolute).replace(/\\/g,'/')||'.',type:entry.isDirectory()?'directory':entry.isFile()?'file':'other'}); } catch {}
    }
    return {root:guard.root,path:rel,entries:results};
  }
  async function inspect(relativePath) {
    const {rel,candidate}=lexicalAbsolute(relativePath); await ensureSafeParents(rel,{createMissing:false});
    try {
      const lst=await fsp.lstat(candidate); if (lst.isSymbolicLink()) throw new Error('symlink targets are not editable by agent transactions'); if (!lst.isFile()) throw new Error('agent transaction path must be a file');
      const stat=await fsp.stat(candidate); if (stat.size>MAX_AGENT_FILE_BYTES) throw new Error('agent transaction file is too large'); const bytes=await fsp.readFile(candidate);
      return {path:rel,exists:true,size:bytes.length,mode:stat.mode,digest:digest(bytes),bytes};
    } catch (error) { if (error?.code==='ENOENT') return {path:rel,exists:false,size:0,mode:null,digest:null,bytes:null}; throw error; }
  }
  async function readText(relativePath) { const snap=await inspect(relativePath); if (!snap.exists) throw new Error(`file not found: ${snap.path}`); return {path:snap.path,content:snap.bytes.toString('utf8'),size:snap.size,digest:snap.digest}; }
  async function writeBytes(relativePath,bytes,{mustExist=null,mode=null,createParents=false}={}) {
    const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes); if (buffer.length>MAX_AGENT_FILE_BYTES) throw new Error('agent transaction file is too large');
    const before=await inspect(relativePath); if (mustExist===true&&!before.exists) throw new Error(`expected existing file: ${before.path}`); if (mustExist===false&&before.exists) throw new Error(`destination already exists: ${before.path}`);
    const createdParents=await ensureSafeParents(before.path,{createMissing:createParents}); const {candidate:target}=lexicalAbsolute(before.path); const parent=path.dirname(target);
    try { const pst=await fsp.lstat(parent); if (pst.isSymbolicLink()||!pst.isDirectory()) throw new Error('unsafe workspace parent'); } catch (error) { if (error?.code==='ENOENT') throw new Error('destination parent does not exist'); throw error; }
    const temp=path.join(parent,`.rwacode-tx-${process.pid}-${crypto.randomUUID()}.tmp`); await fsp.writeFile(temp,buffer,{mode:mode||before.mode||0o600,flag:'wx'});
    try { await fsp.rename(temp,target); if (mode||before.mode) await fsp.chmod(target,(mode||before.mode)&0o777).catch(()=>{}); } catch (error) { await fsp.rm(temp,{force:true}).catch(()=>{}); throw error; }
    const after=await inspect(before.path); return {...after,createdParents};
  }
  async function removeFile(relativePath) { const before=await inspect(relativePath); if (!before.exists) throw new Error(`file not found: ${before.path}`); const {candidate}=lexicalAbsolute(before.path); await fsp.unlink(candidate); }
  async function renameFile(fromPath,toPath,{createParents=false}={}) {
    const from=await inspect(fromPath); if (!from.exists) throw new Error(`file not found: ${from.path}`); const to=await inspect(toPath); if (to.exists) throw new Error(`destination already exists: ${to.path}`);
    const createdParents=await ensureSafeParents(to.path,{createMissing:createParents}); const source=lexicalAbsolute(from.path).candidate; const destination=lexicalAbsolute(to.path).candidate; await fsp.rename(source,destination); return {createdParents};
  }
  async function removeEmptyDirectories(relativeDirs=[]) {
    const unique=[...new Set(relativeDirs.map((v)=>normalizeDirectoryRelative(v)).filter((v)=>v!=='.'))].sort((a,b)=>b.split('/').length-a.split('/').length);
    for (const rel of unique) {
      const absolute=path.resolve(guard.root,rel); if (!absolute.startsWith(guard.root+path.sep)) continue;
      try { const st=await fsp.lstat(absolute); if (st.isSymbolicLink()||!st.isDirectory()) continue; const entries=await fsp.readdir(absolute); if (!entries.length) await fsp.rmdir(absolute); } catch {}
    }
  }
  return {id:'local',type:'local',root:guard.root,capabilities:{list:true,read:true,search:true,write:true,create:true,rename:true,delete:true,watch:true,versioning:false,syncBack:false,commit:false,nestedCreate:true},listDirectory,inspect,readText,writeBytes,removeFile,renameFile,removeEmptyDirectories};
}
module.exports={createLocalWorkspaceAdapter,normalizeRelative,normalizeDirectoryRelative,MAX_AGENT_FILE_BYTES};
