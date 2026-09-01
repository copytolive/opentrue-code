'use strict';

const { createProjectContextEngine } = require('./project-context.cjs');

const MAX_AI_CONTEXT_BYTES = 256 * 1024;
const MAX_AI_REPLY_BYTES = 1024 * 1024;
const MAX_ACTIVE_CONTEXT_FILES = 8;
const ACTIVE_CONTEXT_START = '[RWACode ACTIVE LOCAL CONTEXT]';
const ACTIVE_CONTEXT_END = '[END RWACode ACTIVE LOCAL CONTEXT]';
const PROJECT_TASK_START = '[RWACODE USER TASK]';
const PROJECT_TASK_END = '[END RWACODE USER TASK]';

function providerFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'ChatGPT';
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
    if (host === 'gemini.google.com') return 'Gemini';
    if (host === 'chat.deepseek.com' || host.endsWith('.chat.deepseek.com')) return 'DeepSeek';
  } catch {}
  return null;
}

// Kept as inert compatibility metadata for tests/documentation only. RWACode no longer
// queries provider DOM with these selectors in production.
function composerSelectors(provider) {
  if (provider === 'ChatGPT') return ['#prompt-textarea','[data-testid="prompt-textarea"]','div.ProseMirror[contenteditable="true"]','[contenteditable="true"][role="textbox"]'];
  if (provider === 'Claude') return ['[data-testid="chat-input"]','div.ProseMirror[contenteditable="true"]','div[contenteditable="true"][role="textbox"]'];
  if (provider === 'Gemini') return ['rich-textarea .ql-editor','.ql-editor[contenteditable="true"]','div[contenteditable="true"][role="textbox"]'];
  return ['textarea#chat-input','div[contenteditable="true"][role="textbox"]'];
}

function sendSelectors(provider) {
  if (provider === 'ChatGPT') return ['button[data-testid="send-button"]'];
  if (provider === 'Claude') return ['button[data-testid*="send"]'];
  if (provider === 'Gemini') return ['button[aria-label*="Send"]'];
  return ['button[type="submit"]'];
}

function buildPrompt(relativePath, content, instruction) {
  const task = String(instruction || '').trim() || 'Read this local file carefully and use it as the source for my next request.';
  return [
    '[RWACode LOCAL FILE CONTEXT]',
    `Selected file: ${relativePath}`,
    '',
    `User instruction: ${task}`,
    '',
    'Security boundary: this payload is for an approved agent route only. Native provider browser pages are manual-only.',
    '',
    `--- BEGIN ${relativePath} ---`,
    content,
    `--- END ${relativePath} ---`,
  ].join('\n');
}

function buildMultiFilePrompt(files, instruction) {
  const task = String(instruction || '').trim() || 'Use these selected local files as the source for my next request.';
  const sections = [];
  for (const file of files) sections.push(`--- BEGIN ${file.path} ---`, file.content, `--- END ${file.path} ---`, '');
  return [
    '[RWACode LOCAL FOLDER CONTEXT]',
    `Selected local files: ${files.length}`,
    '',
    `User instruction: ${task}`,
    '',
    'Security boundary: this bounded context is for an approved agent route only. Native provider browser pages are manual-only.',
    '',
    ...sections,
  ].join('\n').trimEnd();
}

function wrapActiveContext(body) {
  return `${ACTIVE_CONTEXT_START}\n${body}\n${ACTIVE_CONTEXT_END}`;
}

function buildProjectTaskEnvelope(context, task) {
  return `${String(context || '').trim()}\n\n${PROJECT_TASK_START}\n${String(task || '').trim()}\n${PROJECT_TASK_END}`.trim();
}

function extractSingleReplacement(text) {
  const source = String(text || '');
  const blocks = [...source.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  if (blocks.length !== 1) throw new Error(`AI import requires exactly one fenced replacement code block; found ${blocks.length}`);
  return blocks[0][1].replace(/\n$/, '');
}

async function installProviderCosmetics() {
  // Strict native-browser contract: never hide, rewrite, inspect, or restyle provider DOM.
  return false;
}

function manualOnlyError(action) {
  return new Error(`Native provider browser is MANUAL_ONLY. RWACode will not ${action} provider DOM. Use the Workspace Agent command surface or an approved official provider API route instead.`);
}

function createAiBridge({ getActiveWebContents, readTextFile } = {}) {
  if (typeof getActiveWebContents !== 'function') throw new Error('getActiveWebContents is required');
  if (typeof readTextFile !== 'function') throw new Error('readTextFile is required');
  const projectContext = createProjectContextEngine();

  async function buildProjectContext(task) {
    return projectContext.build(String(task || '').trim());
  }

  async function sendFile() {
    throw manualOnlyError('insert local files into');
  }

  async function readReply() {
    throw manualOnlyError('scrape or read');
  }

  return { sendFile, readReply, buildProjectContext };
}

module.exports = {
  createAiBridge,
  providerFromUrl,
  composerSelectors,
  sendSelectors,
  buildPrompt,
  buildMultiFilePrompt,
  wrapActiveContext,
  buildProjectTaskEnvelope,
  extractSingleReplacement,
  installProviderCosmetics,
  MAX_AI_CONTEXT_BYTES,
  MAX_AI_REPLY_BYTES,
  MAX_ACTIVE_CONTEXT_FILES,
  ACTIVE_CONTEXT_START,
  ACTIVE_CONTEXT_END,
  PROJECT_TASK_START,
  PROJECT_TASK_END,
};
