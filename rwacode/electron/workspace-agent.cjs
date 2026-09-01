'use strict';

const fsp = require('node:fs').promises;
const path = require('node:path');
const { createLocalWorkspaceAdapter } = require('./workspace-adapter.cjs');
const { createWorkspaceRetriever } = require('./workspace-retriever.cjs');
const { createAgentRunner } = require('./agent-runner.cjs');
const { createTransactionEngine } = require('./transaction-engine.cjs');

function createWorkspaceAgent({ root, journalPath = null, onWorkspaceChanged = null, projectContext = null } = {}) {
  const adapter = createLocalWorkspaceAdapter({ root });
  const context = projectContext || createWorkspaceRetriever({ root:adapter.root });
  const runner = createAgentRunner({ root:adapter.root, projectContext:context, adapter });
  let activePreparedId = null;

  async function journal(entry) {
    if (!journalPath) return;
    await fsp.mkdir(path.dirname(journalPath), { recursive:true });
    await fsp.appendFile(journalPath, JSON.stringify(entry) + '\n', { encoding:'utf8', mode:0o600 });
  }
  const transactions = createTransactionEngine({ adapter, journal, onApplied:async (tx) => {
    context.invalidate();
    if (onWorkspaceChanged) await onWorkspaceChanged(tx);
  }});

  async function plan(task, { mode = 'normal' } = {}) {
    const result = await runner.plan(task);
    const tx = await transactions.prepare(result.changeSet, { task, runner:result.runner });
    activePreparedId = tx.id;
    if (String(mode).toLowerCase() === 'auto') {
      const applied = await transactions.apply(tx.id);
      activePreparedId = null;
      return { ...applied, runnerAvailability:runner.availability(), evidence:result.evidence || null };
    }
    return { ...tx, runnerAvailability:runner.availability(), evidence:result.evidence || null };
  }
  async function apply(id = activePreparedId) {
    if (!id) throw new Error('no prepared transaction');
    const tx = await transactions.apply(id);
    if (activePreparedId === id) activePreparedId = null;
    return tx;
  }
  async function undo(id) { return transactions.undo(id); }
  function status() { return { workspace:{ id:adapter.id, type:adapter.type, root:adapter.root, capabilities:adapter.capabilities }, runners:runner.availability(), transaction:transactions.status(), activePreparedId }; }
  function invalidate() { context.invalidate(); }
  return { plan, apply, undo, status, invalidate, adapter };
}

module.exports = { createWorkspaceAgent };
