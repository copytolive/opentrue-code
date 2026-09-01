'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');
const { createLocalWorkspaceAdapter } = require('./workspace-adapter.cjs');
const { createWorkspaceRetriever } = require('./workspace-retriever.cjs');
const { createAgentRunner } = require('./agent-runner.cjs');
const { createTransactionEngine } = require('./transaction-engine.cjs');

function createWorkspaceAgent({ root = null, adapter = null, journalPath = null, onWorkspaceChanged = null, projectContext = null } = {}) {
  const workspaceAdapter = adapter || createLocalWorkspaceAdapter({ root });
  const context = projectContext || createWorkspaceRetriever({ root:workspaceAdapter.root });
  const runner = createAgentRunner({ root:workspaceAdapter.root, projectContext:context, adapter:workspaceAdapter });
  let activePreparedId = null;
  let lastSourceState = null;

  async function journal(entry) {
    if (!journalPath) return;
    await fsp.mkdir(path.dirname(journalPath), { recursive:true });
    await fsp.appendFile(journalPath, JSON.stringify(entry) + '\n', { encoding:'utf8', mode:0o600 });
  }

  async function readSourceState() {
    if (typeof workspaceAdapter.sourceState !== 'function') return null;
    lastSourceState = await workspaceAdapter.sourceState();
    return lastSourceState;
  }

  async function enrich(tx) {
    return {
      ...tx,
      workspace:{ id:workspaceAdapter.id, type:workspaceAdapter.type, root:workspaceAdapter.root, capabilities:workspaceAdapter.capabilities, source:workspaceAdapter.source || null },
      sourceState:await readSourceState(),
    };
  }

  const transactions = createTransactionEngine({ adapter:workspaceAdapter, journal, onApplied:async (tx) => {
    context.invalidate();
    if (onWorkspaceChanged) await onWorkspaceChanged(await enrich(tx));
  }});

  async function plan(task, { mode = 'normal' } = {}) {
    const result = await runner.plan(task);
    const tx = await transactions.prepare(result.changeSet, { task, runner:result.runner });
    activePreparedId = tx.id;
    if (String(mode).toLowerCase() === 'auto') {
      const applied = await transactions.apply(tx.id);
      activePreparedId = null;
      return { ...(await enrich(applied)), runnerAvailability:runner.availability(), evidence:result.evidence || null };
    }
    return { ...(await enrich(tx)), runnerAvailability:runner.availability(), evidence:result.evidence || null };
  }

  async function apply(id = activePreparedId) {
    if (!id) throw new Error('no prepared transaction');
    const tx = await transactions.apply(id);
    if (activePreparedId === id) activePreparedId = null;
    return enrich(tx);
  }

  async function undo(id) {
    const transactionId = id || transactions.status().lastTransaction?.id || null;
    const driveSynced = workspaceAdapter.type === 'googledrive' && transactionId && typeof workspaceAdapter.hasSyncedTransaction === 'function' && workspaceAdapter.hasSyncedTransaction(transactionId);
    if (driveSynced && typeof workspaceAdapter.assertRollbackSync === 'function') await workspaceAdapter.assertRollbackSync({ transactionId });
    const undone = await transactions.undo(transactionId || undefined);
    if (driveSynced && typeof workspaceAdapter.rollbackSync === 'function') await workspaceAdapter.rollbackSync({ transactionId });
    return enrich(undone);
  }

  async function explicitGitAction(action, payload = {}, transactionId = null) {
    if (workspaceAdapter.type !== 'github') throw new Error('GitHub action requires an @GitHub workspace');
    const last = transactions.status().lastTransaction;
    if (!last || last.status !== 'APPLIED') throw new Error('GitHub commit/push/PR requires an applied RWACode transaction');
    if (transactionId && last.id !== transactionId) throw new Error('GitHub action transaction does not match the active applied transaction');
    if (action === 'commit') return workspaceAdapter.commit({ message:payload.message, paths:last.touched });
    if (action === 'push') return workspaceAdapter.push();
    if (action === 'pr') return workspaceAdapter.createPullRequest({ title:payload.title, body:payload.body });
    throw new Error('unsupported explicit GitHub action');
  }

  async function explicitDriveAction(action, payload = {}, transactionId = null) {
    if (workspaceAdapter.type !== 'googledrive') throw new Error('Google Drive action requires an @GoogleDrive workspace');
    const last = transactions.status().lastTransaction;
    if (!last || last.status !== 'APPLIED') throw new Error('Google Drive sync requires an applied RWACode transaction');
    if (transactionId && last.id !== transactionId) throw new Error('Google Drive action transaction does not match the active applied transaction');
    if (action === 'sync') return workspaceAdapter.syncBack({ transactionId:last.id, paths:last.touched, ...payload });
    throw new Error('unsupported explicit Google Drive action');
  }

  function status() {
    return {
      workspace:{ id:workspaceAdapter.id, type:workspaceAdapter.type, root:workspaceAdapter.root, capabilities:workspaceAdapter.capabilities, source:workspaceAdapter.source || null },
      runners:runner.availability(),
      transaction:transactions.status(),
      sourceState:lastSourceState,
      activePreparedId,
    };
  }
  function invalidate() { context.invalidate(); }
  return { plan, apply, undo, status, invalidate, adapter:workspaceAdapter, explicitGitAction, explicitDriveAction };
}

module.exports = { createWorkspaceAgent };
