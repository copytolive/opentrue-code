'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createProviderChatRunner } = require('./provider-chat-runner.cjs');

// Provider web pages are never used as an automated agent backend. In chat-first
// mode a selected provider is routed only to that provider's approved official API.
const CHAT_PROVIDERS = ['chatgpt','claude','gemini','deepseek'];
const ALLOWLIST = [...CHAT_PROVIDERS];
const CHANGESET_SCHEMA = {
  type:'object', additionalProperties:false, required:['version','summary','operations'],
  properties:{
    version:{ const:1 }, summary:{ type:'string', minLength:1, maxLength:500 },
    operations:{ type:'array', maxItems:24, items:{ type:'object', additionalProperties:false, required:['type','path'], properties:{ type:{ enum:['MODIFY','CREATE','RENAME','DELETE'] }, path:{ type:'string', minLength:1 }, content:{ type:'string' }, to:{ type:'string' } } } },
  },
};

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function findExecutable(name, env = process.env) {
  const candidates = [];
  for (const dir of String(env.PATH || '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, name));
  candidates.push(path.join(os.homedir(), '.local', 'bin', name), path.join(os.homedir(), '.npm-global', 'bin', name), path.join('/opt/homebrew/bin', name), path.join('/usr/local/bin', name), path.join('/usr/bin', name));
  for (const candidate of [...new Set(candidates)]) {
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch {}
  }
  return null;
}

function parseLiteralTask(task) {
  const source = String(task || '').trim();
  let match = source.match(/^(?:(?:ubah|ganti|set)\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s+(?:menjadi|ke)\s+(.+)$/i);
  if (!match) match = source.match(/^(?:change|set)\s+([A-Za-z_][A-Za-z0-9_.-]*)\s+(?:to|=)\s+(.+)$/i);
  if (!match) return null;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (!value || value.includes('\n') || value.includes('\r')) return null;
  return { key:match[1], value };
}

async function deterministicLiteralPlan(task, projectContext, adapter) {
  const parsed = parseLiteralTask(task);
  if (!parsed || typeof projectContext.searchText !== 'function') return null;
  const candidates = await projectContext.searchText(`${parsed.key}=`, { limit:80 });
  const matches = [];
  const key = escapeRegex(parsed.key);
  const assignment = new RegExp(`(^|\\n)([\\t ]*${key}[\\t ]*=[\\t ]*)([^\\r\\n]*)`, 'g');
  for (const candidate of candidates) {
    const file = await adapter.readText(candidate.path).catch(() => null);
    if (!file) continue;
    const found = [...file.content.matchAll(assignment)];
    if (found.length === 1) matches.push({ file, match:found[0] });
  }
  if (matches.length !== 1) return null;
  const { file, match } = matches[0];
  const start = match.index + match[1].length;
  const prefix = match[2];
  const oldValue = match[3];
  if (oldValue === parsed.value) throw new Error(`${parsed.key} is already ${parsed.value}`);
  const replacement = `${prefix}${parsed.value}`;
  const content = file.content.slice(0, start) + replacement + file.content.slice(start + prefix.length + oldValue.length);
  return { runner:'local-literal', changeSet:{ version:1, summary:`Set ${parsed.key} to ${parsed.value}`, operations:[{ type:'MODIFY', path:file.path, content }] }, evidence:{ path:file.path, key:parsed.key, before:oldValue, after:parsed.value } };
}

function runnerPrompt(task, contextText, extraContextText = '') {
  const extra = String(extraContextText || '').trim();
  return [
    'You are the planning-only coding agent inside RWACode.',
    'The editable target workspace context is embedded below.',
    'Additional reference context, when supplied, is READ-ONLY evidence and must never become a write target.',
    'Do not edit files directly. Do not create files directly. Do not use browser automation or provider web pages.',
    'Do not request or read browser cookies, sessions, tokens, credentials, or private browser state.',
    'Return ONLY a JSON ChangeSet matching this shape:',
    '{"version":1,"summary":"...","operations":[{"type":"MODIFY|CREATE|RENAME|DELETE","path":"relative/path","content":"complete UTF-8 text for CREATE/MODIFY","to":"relative/path for RENAME"}]}',
    'For MODIFY and CREATE, content must be complete final UTF-8 file contents, never a patch.',
    'Paths must be relative to the editable target workspace root. Never include shell commands.',
    'Touch the minimum set of target files required for the user task. Preserve unrelated behavior.',
    'If supplied target context is insufficient to make a safe concrete edit, return an empty operations array and explain the missing context in summary.',
    '', '[RWACODE EDITABLE TARGET CONTEXT]', contextText, '[END RWACODE EDITABLE TARGET CONTEXT]',
    ...(extra ? ['', '[RWACODE READ-ONLY REFERENCE CONTEXT]', extra, '[END RWACODE READ-ONLY REFERENCE CONTEXT]'] : []),
    '', '[RWACODE USER TASK]', String(task || '').trim(), '[END RWACODE USER TASK]',
  ].join('\n');
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const direct = raw.match(/^\s*\{[\s\S]*\}\s*$/); if (direct) return JSON.parse(direct[0]);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('agent runner did not return a JSON ChangeSet');
}

function createAgentRunner({ root, projectContext, adapter, env = process.env, providerRunner = null } = {}) {
  if (!root || !projectContext || !adapter) throw new Error('AgentRunner requires root, projectContext, and adapter');
  const chatProviders = providerRunner || createProviderChatRunner({ env });

  function availability() {
    return {
      localLiteral:{ available:true, mode:'legacy-deterministic-safe-replacement' },
      providers:chatProviders.availability(),
      routing:{ mode:'chat-first-provider-pure', providerWeb:'MANUAL_ONLY', cliFallback:false },
    };
  }

  async function plan(task, { provider = 'auto', chatOnly = false, extraContextText = '', extraContextEvidence = [] } = {}) {
    const cleanTask = String(task || '').trim();
    if (!cleanTask) throw new Error('agent task is empty');

    // Preserve the previously accepted literal bridge for legacy callers only.
    // Chat-first UI passes chatOnly=true so every chat task stays on the selected AI provider route.
    if (!chatOnly) {
      const literal = await deterministicLiteralPlan(cleanTask, projectContext, adapter);
      if (literal) return literal;
    }

    const context = await projectContext.build(cleanTask);
    const prompt = runnerPrompt(cleanTask, context.text, extraContextText);
    const available = availability();
    const selected = String(provider || 'auto').trim().toLowerCase();
    const evidence = {
      contextFiles:context.files,
      indexedFiles:context.indexedFiles,
      contextBytes:context.bytes,
      requestedProvider:selected,
      chatOnly:Boolean(chatOnly),
      referenceContexts:Array.isArray(extraContextEvidence) ? extraContextEvidence : [],
    };

    const runProvider = async (id) => {
      if (!available.providers?.[id]?.available) return null;
      const changeSet = await chatProviders.plan(id, prompt);
      return { runner:`${id}-official-api`, changeSet, evidence:{ ...evidence, resolvedProvider:id } };
    };

    if (selected !== 'auto') {
      if (!CHAT_PROVIDERS.includes(selected)) throw new Error(`unsupported chat provider selection: ${selected}`);
      if (!available.providers?.[selected]?.available) {
        throw new Error(`${selected} official API route is not configured. RWACode will not fall back to another provider, CLI, browser scraping, cookies, or session reuse.`);
      }
      return runProvider(selected);
    }

    for (const id of CHAT_PROVIDERS) {
      if (!available.providers?.[id]?.available) continue;
      try { return await runProvider(id); } catch (error) { /* try next configured official API only */ }
    }
    throw new Error('No approved official chat provider API route is available. Configure at least one provider model + credential in the RWACode runtime environment. Native provider web remains MANUAL_ONLY.');
  }

  return { plan, availability, allowlist:[...ALLOWLIST] };
}

module.exports = { createAgentRunner, findExecutable, parseLiteralTask, deterministicLiteralPlan, extractJsonObject, runnerPrompt, CHANGESET_SCHEMA, CHAT_PROVIDERS, ALLOWLIST };
