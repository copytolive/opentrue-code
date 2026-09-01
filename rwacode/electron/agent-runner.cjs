'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ALLOWLIST = ['claude','gemini'];
const MAX_RUNNER_OUTPUT_BYTES = 2 * 1024 * 1024;
const RUNNER_TIMEOUT_MS = 120000;

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
  let match = source.match(/^(?:ubah|ganti|set)\s+([A-Za-z_][A-Za-z0-9_.-]*)\s+(?:menjadi|ke)\s+(.+)$/i);
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
  const candidates = await projectContext.searchText(`${parsed.key}=`, { limit: 80 });
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

function runnerPrompt(task, contextText) {
  return [
    'You are the read-only planning runner inside RWACode.',
    'Do not edit files. Do not create files. Do not run destructive commands.',
    'Return ONLY a JSON object with this exact shape:',
    '{"version":1,"summary":"...","operations":[{"type":"MODIFY|CREATE|RENAME|DELETE","path":"relative/path","content":"complete UTF-8 text for CREATE/MODIFY","to":"relative/path for RENAME"}]}',
    'Paths must be relative to the current workspace. Never include shell commands.',
    '',
    contextText,
    '',
    '[RWACODE USER TASK]',
    String(task || '').trim(),
    '[END RWACODE USER TASK]',
  ].join('\n');
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const direct = raw.match(/^\s*\{[\s\S]*\}\s*$/);
  if (direct) return JSON.parse(direct[0]);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('agent runner did not return a JSON ChangeSet');
}

function runProcess(executable, args, { cwd, timeoutMs = RUNNER_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'], env:{ ...process.env } });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let settled = false;
    const timer = setTimeout(() => { if (!settled) { child.kill('SIGTERM'); reject(new Error('agent runner timed out')); } }, timeoutMs);
    const append = (current, chunk) => {
      const next = Buffer.concat([current, Buffer.from(chunk)]);
      if (next.length > MAX_RUNNER_OUTPUT_BYTES) { child.kill('SIGTERM'); throw new Error('agent runner output exceeded limit'); }
      return next;
    };
    child.stdout.on('data', (chunk) => { try { stdout = append(stdout, chunk); } catch (error) { reject(error); } });
    child.stderr.on('data', (chunk) => { try { stderr = append(stderr, chunk); } catch (error) { reject(error); } });
    child.on('error', reject);
    child.on('close', (code) => {
      settled = true; clearTimeout(timer);
      if (code !== 0) return reject(new Error(`agent runner exited ${code}: ${stderr.toString('utf8').trim().slice(0, 600)}`));
      resolve({ stdout:stdout.toString('utf8'), stderr:stderr.toString('utf8') });
    });
  });
}

function parseClaudeOutput(stdout) {
  const parsed = JSON.parse(stdout);
  const body = parsed.structured_output || parsed.result || parsed.response;
  return typeof body === 'string' ? extractJsonObject(body) : body;
}
function parseGeminiOutput(stdout) {
  const parsed = JSON.parse(stdout);
  return extractJsonObject(parsed.response || parsed.result || '');
}

function createAgentRunner({ root, projectContext, adapter, env = process.env } = {}) {
  if (!root || !projectContext || !adapter) throw new Error('AgentRunner requires root, projectContext, and adapter');
  function availability() {
    const claude = findExecutable('claude', env);
    const gemini = findExecutable('gemini', env);
    return {
      localLiteral: { available:true, mode:'deterministic-safe-replacement' },
      claude: { available:Boolean(claude), executable:claude || null, mode:'plan-read-glob-grep-only' },
      gemini: { available:Boolean(gemini), executable:gemini || null, mode:'sandbox-plan' },
      codex: { available:false, executable:findExecutable('codex', env) || null, mode:'disabled-until-read-only-sandbox-is-reliably-enforced' },
    };
  }

  async function plan(task) {
    const cleanTask = String(task || '').trim();
    if (!cleanTask) throw new Error('agent task is empty');
    const literal = await deterministicLiteralPlan(cleanTask, projectContext, adapter);
    if (literal) return literal;
    const context = await projectContext.build(cleanTask);
    const prompt = runnerPrompt(cleanTask, context.text);
    const available = availability();
    const failures = [];

    if (available.claude.available) {
      try {
        const schema = JSON.stringify({ type:'object', required:['version','summary','operations'], properties:{ version:{const:1}, summary:{type:'string'}, operations:{type:'array'} } });
        const result = await runProcess(available.claude.executable, ['-p', prompt, '--output-format','json','--json-schema',schema,'--permission-mode','plan','--tools','Read,Glob,Grep','--no-session-persistence','--no-chrome','--max-turns','8'], { cwd:root });
        return { runner:'claude', changeSet:parseClaudeOutput(result.stdout) };
      } catch (error) { failures.push(`Claude: ${error.message}`); }
    }
    if (available.gemini.available) {
      try {
        const result = await runProcess(available.gemini.executable, ['--sandbox','--approval-mode','plan','--output-format','json','--prompt',prompt], { cwd:root });
        return { runner:'gemini', changeSet:parseGeminiOutput(result.stdout) };
      } catch (error) { failures.push(`Gemini: ${error.message}`); }
    }
    const detail = failures.length ? failures.join(' | ') : 'No supported official read-only coding CLI is available.';
    throw new Error(`${detail} Install/sign in to Claude Code or Gemini CLI, or use an unambiguous literal replacement task.`);
  }

  return { plan, availability, allowlist:[...ALLOWLIST] };
}

module.exports = { createAgentRunner, findExecutable, parseLiteralTask, deterministicLiteralPlan, extractJsonObject, runnerPrompt, ALLOWLIST };
