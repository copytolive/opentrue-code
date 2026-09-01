'use strict';

const crypto = require('node:crypto');

const VALID_TYPES = new Set(['CREATE','MODIFY','RENAME','DELETE']);
const MAX_OPERATIONS = 24;

function cloneSnapshot(snapshot) {
  return { ...snapshot, bytes: snapshot.bytes ? Buffer.from(snapshot.bytes) : null };
}
function stateMatches(a, b) {
  return Boolean(a?.exists) === Boolean(b?.exists) && (!a?.exists || a.digest === b.digest);
}
function operationPaths(op) { return op.type === 'RENAME' ? [op.path, op.to] : [op.path]; }
function validateChangeSet(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('ChangeSet must be an object');
  const operations = Array.isArray(input.operations) ? input.operations : [];
  if (!operations.length || operations.length > MAX_OPERATIONS) throw new Error(`ChangeSet operations must contain 1-${MAX_OPERATIONS} items`);
  if ('command' in input || 'shell' in input || 'exec' in input) throw new Error('ChangeSet cannot contain shell commands');
  const normalized = operations.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`invalid ChangeSet operation ${index + 1}`);
    const type = String(raw.type || '').toUpperCase();
    if (!VALID_TYPES.has(type)) throw new Error(`unsupported ChangeSet operation: ${type || '(empty)'}`);
    if ('command' in raw || 'shell' in raw || 'exec' in raw) throw new Error('ChangeSet operations cannot contain shell commands');
    const op = { type, path: String(raw.path || '').trim() };
    if (!op.path) throw new Error(`operation ${index + 1} is missing path`);
    if (type === 'CREATE' || type === 'MODIFY') op.content = String(raw.content ?? '');
    if (type === 'RENAME') { op.to = String(raw.to || '').trim(); if (!op.to) throw new Error('RENAME requires to'); }
    return op;
  });
  const paths = new Set();
  for (const op of normalized) {
    for (const p of operationPaths(op)) {
      if (paths.has(p)) throw new Error(`ChangeSet touches the same path twice: ${p}`);
      paths.add(p);
    }
  }
  return { version: 1, summary: String(input.summary || 'Workspace change').slice(0, 500), operations: normalized };
}

function simpleDiff(pathValue, before, after) {
  const oldText = before.exists ? before.bytes.toString('utf8') : '';
  const newText = after.exists ? after.bytes.toString('utf8') : '';
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines = [`--- ${before.exists ? `a/${pathValue}` : '/dev/null'}`, `+++ ${after.exists ? `b/${pathValue}` : '/dev/null'}`, '@@ RWACode transaction @@'];
  for (const line of oldLines) lines.push(`-${line}`);
  for (const line of newLines) lines.push(`+${line}`);
  return lines.join('\n');
}

function createTransactionEngine({ adapter, onApplied = null, journal = null } = {}) {
  if (!adapter) throw new Error('workspace adapter is required');
  const transactions = new Map();
  let lastAppliedId = null;

  async function capturePaths(paths) {
    const result = new Map();
    for (const p of paths) result.set(p, cloneSnapshot(await adapter.inspect(p)));
    return result;
  }

  function projectedSnapshot(op, beforeMap, pathValue) {
    const before = beforeMap.get(pathValue);
    if (op.type === 'MODIFY' && pathValue === op.path) return { ...before, exists:true, bytes:Buffer.from(op.content), size:Buffer.byteLength(op.content), digest:crypto.createHash('sha256').update(op.content).digest('hex') };
    if (op.type === 'CREATE' && pathValue === op.path) return { path:pathValue, exists:true, bytes:Buffer.from(op.content), size:Buffer.byteLength(op.content), mode:0o600, digest:crypto.createHash('sha256').update(op.content).digest('hex') };
    if (op.type === 'DELETE' && pathValue === op.path) return { path:pathValue, exists:false, bytes:null, size:0, mode:null, digest:null };
    if (op.type === 'RENAME') {
      if (pathValue === op.path) return { path:pathValue, exists:false, bytes:null, size:0, mode:null, digest:null };
      if (pathValue === op.to) { const src = beforeMap.get(op.path); return { ...src, path:pathValue, bytes:src.bytes ? Buffer.from(src.bytes) : null }; }
    }
    return cloneSnapshot(before);
  }

  async function prepare(rawChangeSet, meta = {}) {
    const changeSet = validateChangeSet(rawChangeSet);
    const touched = [...new Set(changeSet.operations.flatMap(operationPaths))];
    const before = await capturePaths(touched);
    for (const op of changeSet.operations) {
      if (op.type === 'MODIFY' && !before.get(op.path).exists) throw new Error(`MODIFY target does not exist: ${op.path}`);
      if (op.type === 'CREATE' && before.get(op.path).exists) throw new Error(`CREATE target already exists: ${op.path}`);
      if (op.type === 'DELETE' && !before.get(op.path).exists) throw new Error(`DELETE target does not exist: ${op.path}`);
      if (op.type === 'RENAME') {
        if (!before.get(op.path).exists) throw new Error(`RENAME source does not exist: ${op.path}`);
        if (before.get(op.to).exists) throw new Error(`RENAME destination exists: ${op.to}`);
      }
    }
    const projected = new Map(touched.map((p) => [p, cloneSnapshot(before.get(p))]));
    for (const op of changeSet.operations) for (const p of operationPaths(op)) projected.set(p, projectedSnapshot(op, before, p));
    const diff = touched.map((p) => simpleDiff(p, before.get(p), projected.get(p))).join('\n\n');
    const id = crypto.randomUUID();
    const tx = { id, status:'PREPARED', createdAt:new Date().toISOString(), task:String(meta.task || ''), runner:String(meta.runner || ''), changeSet, touched, before, projected, after:null, diff };
    transactions.set(id, tx);
    while (transactions.size > 20) transactions.delete(transactions.keys().next().value);
    return publicTransaction(tx);
  }

  async function verifyCurrent(expectedMap, touched, label) {
    for (const p of touched) {
      const current = await adapter.inspect(p);
      if (!stateMatches(current, expectedMap.get(p))) throw new Error(`${label} conflict: ${p} changed outside this transaction`);
    }
  }

  async function restoreMap(snapshotMap, touched) {
    for (const p of [...touched].reverse()) {
      const desired = snapshotMap.get(p);
      const current = await adapter.inspect(p);
      if (desired.exists) await adapter.writeBytes(p, desired.bytes, { mustExist: current.exists ? true : false, mode: desired.mode });
      else if (current.exists) await adapter.removeFile(p);
    }
  }

  async function applyOperation(op) {
    if (op.type === 'MODIFY') return adapter.writeBytes(op.path, Buffer.from(op.content), { mustExist:true });
    if (op.type === 'CREATE') return adapter.writeBytes(op.path, Buffer.from(op.content), { mustExist:false });
    if (op.type === 'DELETE') return adapter.removeFile(op.path);
    if (op.type === 'RENAME') return adapter.renameFile(op.path, op.to);
    throw new Error(`unsupported operation: ${op.type}`);
  }

  async function apply(id) {
    const tx = transactions.get(id);
    if (!tx || tx.status !== 'PREPARED') throw new Error('transaction is not ready to apply');
    await verifyCurrent(tx.before, tx.touched, 'apply');
    try {
      for (const op of tx.changeSet.operations) await applyOperation(op);
      tx.after = await capturePaths(tx.touched);
      tx.status = 'APPLIED';
      tx.appliedAt = new Date().toISOString();
      lastAppliedId = tx.id;
      if (journal) await journal({ id:tx.id, status:tx.status, task:tx.task, runner:tx.runner, summary:tx.changeSet.summary, touched:tx.touched, at:tx.appliedAt });
      if (onApplied) await onApplied(publicTransaction(tx));
      return publicTransaction(tx);
    } catch (error) {
      await restoreMap(tx.before, tx.touched).catch(() => {});
      tx.status = 'FAILED';
      throw error;
    }
  }

  async function undo(id = lastAppliedId) {
    const tx = transactions.get(id);
    if (!tx || tx.status !== 'APPLIED' || !tx.after) throw new Error('no applied transaction is available to undo');
    await verifyCurrent(tx.after, tx.touched, 'undo');
    const beforeUndo = await capturePaths(tx.touched);
    try {
      await restoreMap(tx.before, tx.touched);
      await verifyCurrent(tx.before, tx.touched, 'undo verification');
      tx.status = 'UNDONE';
      tx.undoneAt = new Date().toISOString();
      if (lastAppliedId === tx.id) lastAppliedId = null;
      if (journal) await journal({ id:tx.id, status:tx.status, touched:tx.touched, at:tx.undoneAt });
      if (onApplied) await onApplied(publicTransaction(tx));
      return publicTransaction(tx);
    } catch (error) {
      await restoreMap(beforeUndo, tx.touched).catch(() => {});
      throw error;
    }
  }

  function publicTransaction(tx) {
    return { id:tx.id, status:tx.status, createdAt:tx.createdAt, appliedAt:tx.appliedAt || null, undoneAt:tx.undoneAt || null, task:tx.task, runner:tx.runner, changeSet:tx.changeSet, touched:[...tx.touched], diff:tx.diff, undoAvailable:tx.status === 'APPLIED' };
  }
  function status() {
    const last = lastAppliedId ? transactions.get(lastAppliedId) : null;
    return { undoAvailable:Boolean(last && last.status === 'APPLIED'), lastTransaction:last ? publicTransaction(last) : null };
  }
  return { prepare, apply, undo, status, validateChangeSet };
}

module.exports = { createTransactionEngine, validateChangeSet, simpleDiff, VALID_TYPES, MAX_OPERATIONS };
