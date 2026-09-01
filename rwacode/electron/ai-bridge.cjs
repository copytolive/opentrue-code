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

function composerSelectors(provider) {
  if (provider === 'ChatGPT') {
    return [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'div.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea[data-testid*="prompt"]',
      'textarea',
    ];
  }
  if (provider === 'Claude') {
    return [
      '[data-testid="chat-input"]',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][data-testid*="input"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea',
    ];
  }
  if (provider === 'Gemini') {
    return [
      'rich-textarea .ql-editor',
      '.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea',
    ];
  }
  return [
    'textarea#chat-input',
    'textarea[placeholder]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea',
  ];
}

function sendSelectors(provider) {
  if (provider === 'ChatGPT') return ['button[data-testid="send-button"]','button[aria-label*="Send"]','button[aria-label*="Kirim"]'];
  if (provider === 'Claude') return ['button[data-testid*="send"]','button[aria-label*="Send"]','button[aria-label*="Kirim"]'];
  if (provider === 'Gemini') return ['button[aria-label*="Send"]','button[aria-label*="Kirim"]','button.send-button'];
  return ['button[aria-label*="Send"]','button[aria-label*="Kirim"]','button[type="submit"]'];
}

function buildPrompt(relativePath, content, instruction) {
  const task = String(instruction || '').trim() || 'Read this local file carefully and use it as the source for my next request.';
  return [
    '[RWACode LOCAL FILE CONTEXT]',
    `Selected file: ${relativePath}`,
    '',
    `User instruction: ${task}`,
    '',
    'Security boundary: you are receiving only this explicitly selected file. You do not have direct filesystem access.',
    'If asked to modify it, return the COMPLETE replacement file contents in exactly one fenced code block.',
    'Do not claim that you read any other local file unless the user explicitly sends it.',
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
    'Security boundary: you are receiving only this bounded, explicitly selected local context. You do not have direct filesystem access.',
    'Use the supplied file contents rather than guessing from a macOS path.',
    'Do not claim that you read any other local file unless it is included below.',
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

async function installProviderCosmetics(wc, provider) {
  if (!wc || wc.isDestroyed() || provider !== 'ChatGPT') return false;
  const script = `(() => {
    const titlePatterns = ['kenali chatgpt work','meet chatgpt work','discover chatgpt work','introducing chatgpt work'];
    const actionPatterns = ['lihat kemampuan work','sesuaikan work untuk saya','see work capabilities','customize work for me'];
    const nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4'));
    for (const node of nodes) {
      const own = (node.innerText || node.textContent || '').trim().toLowerCase();
      if (!own || !titlePatterns.some((pattern) => own.includes(pattern))) continue;
      let candidate = node;
      for (let depth = 0; candidate && depth < 6; depth += 1, candidate = candidate.parentElement) {
        const text = (candidate.innerText || candidate.textContent || '').trim().toLowerCase();
        const actionHits = actionPatterns.filter((pattern) => text.includes(pattern)).length;
        const hasComposer = !!candidate.querySelector('textarea,[contenteditable="true"][role="textbox"],#prompt-textarea');
        if (!hasComposer && text.length < 1800 && actionHits >= 1) {
          candidate.style.setProperty('display', 'none', 'important');
          candidate.dataset.rwacodeCosmetic = 'chatgpt-work-promo';
          return true;
        }
      }
    }
    return false;
  })()`;
  try {
    return !!(await wc.executeJavaScript(script, true));
  } catch {
    return false;
  }
}

function createAiBridge({ getActiveWebContents, readTextFile }) {
  if (typeof getActiveWebContents !== 'function') throw new Error('getActiveWebContents is required');
  if (typeof readTextFile !== 'function') throw new Error('readTextFile is required');

  const projectContext = createProjectContextEngine();

  async function buildProjectContext(task) {
    return projectContext.build(String(task || '').trim());
  }

  async function sendFile(relativePath, instruction) {
    const wc = getActiveWebContents();
    if (!wc || wc.isDestroyed()) throw new Error('no active browser tab');
    const provider = providerFromUrl(wc.getURL());
    if (!provider) throw new Error('active tab must be ChatGPT, Claude, Gemini, or DeepSeek');

    let files = [];
    if (Array.isArray(relativePath)) {
      const paths = [...new Set(relativePath.map(String).map((value) => value.trim()).filter(Boolean))].slice(0, MAX_ACTIVE_CONTEXT_FILES);
      if (!paths.length) throw new Error('active local context is empty');
      let totalBytes = 0;
      for (const pathValue of paths) {
        const file = await readTextFile(pathValue);
        const bytes = Buffer.byteLength(file.content, 'utf8');
        totalBytes += bytes;
        if (totalBytes > MAX_AI_CONTEXT_BYTES) throw new Error('selected local context is too large for the AI bridge (256 KiB max)');
        files.push(file);
      }
    } else {
      const file = await readTextFile(relativePath);
      const bytes = Buffer.byteLength(file.content, 'utf8');
      if (bytes > MAX_AI_CONTEXT_BYTES) throw new Error('selected file is too large for the local AI bridge (256 KiB max)');
      files = [file];
    }

    const body = files.length === 1 ? buildPrompt(files[0].path, files[0].content, instruction) : buildMultiFilePrompt(files, instruction);
    const prompt = wrapActiveContext(body);
    const totalSize = files.reduce((sum, file) => sum + Number(file.size || Buffer.byteLength(file.content, 'utf8')), 0);
    const selectors = composerSelectors(provider);
    const script = `(async () => {
      const prompt = ${JSON.stringify(prompt)};
      const activeStart = ${JSON.stringify(ACTIVE_CONTEXT_START)};
      const activeEnd = ${JSON.stringify(ACTIVE_CONTEXT_END)};
      const selectors = ${JSON.stringify(selectors)};
      const findInput = () => selectors.map((selector) => document.querySelector(selector)).find(Boolean);
      const deadline = Date.now() + 12000;
      let input = findInput();
      while (!input && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        input = findInput();
      }
      if (!input) return { ok:false, error:'composer not found after waiting for provider UI' };
      const stripPreviousContext = (value) => {
        const source = String(value || '');
        const start = source.indexOf(activeStart);
        if (start < 0) return source;
        const end = source.indexOf(activeEnd, start + activeStart.length);
        if (end < 0) return source;
        return (source.slice(0, start) + source.slice(end + activeEnd.length)).replace(/^\\s+|\\s+$/g, '');
      };
      input.focus();
      const existing = 'value' in input ? input.value : (input.innerText || input.textContent || '');
      const userText = stripPreviousContext(existing);
      const combined = userText.trim() ? prompt + '\n\n' + userText : prompt;
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(input, combined); else input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
      } else {
        try {
          const range = document.createRange();
          range.selectNodeContents(input);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('insertText', false, combined);
        } catch { input.textContent = combined; }
        try { input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:combined })); }
        catch { input.dispatchEvent(new Event('input', { bubbles:true })); }
      }
      input.focus();
      return { ok:true, inserted:true, submitted:false };
    })()`;
    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) throw new Error(result?.error || 'could not insert local file context');
    return { provider, path: files[0].path, paths: files.map((file) => file.path), size: totalSize, fileCount: files.length, inserted:true, submitted:false };
  }

  async function readReply() {
    const wc = getActiveWebContents();
    if (!wc || wc.isDestroyed()) throw new Error('no active browser tab');
    const provider = providerFromUrl(wc.getURL());
    if (!provider) throw new Error('active tab must be ChatGPT, Claude, Gemini, or DeepSeek');
    const messageSelectors = provider === 'ChatGPT'
      ? ['[data-message-author-role="assistant"]','article[data-testid^="conversation-turn"] .markdown','article .markdown']
      : provider === 'Claude'
        ? ['[data-testid="assistant-message"]','.font-claude-message','[class*="font-claude-message"]','.prose']
        : provider === 'Gemini'
          ? ['model-response','.model-response-text','message-content','.markdown']
          : ['[class*="assistant"] .markdown','[class*="message"] .markdown','.ds-markdown','.markdown'];
    const script = `(() => {
      const selectors = ${JSON.stringify(messageSelectors)};
      let messages = [];
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector)).filter((node) => (node.innerText || '').trim());
        if (found.length) { messages = found; break; }
      }
      const node = messages.at(-1);
      if (!node) return { ok:false, error:'assistant reply not found yet' };
      let codeBlocks = [];
      for (const selector of ['pre code','code-block','pre','.code-block']) {
        const found = Array.from(node.querySelectorAll(selector)).map((code) => (code.innerText || code.textContent || '').replace(/\n$/, '')).filter((value) => value.trim().length > 0);
        if (found.length) { codeBlocks = [...new Set(found)]; break; }
      }
      return { ok:true, text:(node.innerText || node.textContent || '').trim(), codeBlocks };
    })()`;
    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) throw new Error(result?.error || 'could not read latest assistant reply');
    const text = String(result.text || '');
    if (!text) throw new Error('latest assistant reply is empty');
    if (Buffer.byteLength(text, 'utf8') > MAX_AI_REPLY_BYTES) throw new Error('assistant reply is too large to import');
    const codeBlocks = Array.isArray(result.codeBlocks) ? result.codeBlocks.map(String) : [];
    if (codeBlocks.length !== 1) throw new Error(`AI import requires exactly one rendered replacement code block; found ${codeBlocks.length}`);
    const replacement = codeBlocks[0];
    if (Buffer.byteLength(replacement, 'utf8') > MAX_AI_REPLY_BYTES) throw new Error('replacement code block is too large to import');
    return { provider, text: `\`\`\`\n${replacement}\n\`\`\`` };
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
