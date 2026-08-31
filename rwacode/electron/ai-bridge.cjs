'use strict';

const MAX_AI_CONTEXT_BYTES = 256 * 1024;
const MAX_AI_REPLY_BYTES = 1024 * 1024;

function providerFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'ChatGPT';
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
    if (host === 'gemini.google.com') return 'Gemini';
  } catch {}
  return null;
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

function extractSingleReplacement(text) {
  const source = String(text || '');
  const blocks = [...source.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  if (blocks.length !== 1) {
    throw new Error(`AI import requires exactly one fenced replacement code block; found ${blocks.length}`);
  }
  return blocks[0][1].replace(/\n$/, '');
}

function createAiBridge({ getActiveWebContents, readTextFile }) {
  if (typeof getActiveWebContents !== 'function') throw new Error('getActiveWebContents is required');
  if (typeof readTextFile !== 'function') throw new Error('readTextFile is required');

  async function sendFile(relativePath, instruction) {
    const wc = getActiveWebContents();
    if (!wc || wc.isDestroyed()) throw new Error('no active browser tab');
    const provider = providerFromUrl(wc.getURL());
    if (!provider) throw new Error('active tab must be ChatGPT, Claude, or Gemini');

    const file = await readTextFile(relativePath);
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_AI_CONTEXT_BYTES) throw new Error('selected file is too large for the local AI bridge (256 KiB max)');
    const prompt = buildPrompt(file.path, file.content, instruction);

    const script = `(() => {
      const prompt = ${JSON.stringify(prompt)};
      const provider = ${JSON.stringify(provider)};
      const selectors = provider === 'ChatGPT'
        ? ['#prompt-textarea','[data-testid="prompt-textarea"]','textarea[data-testid*="prompt"]','textarea']
        : provider === 'Claude'
          ? ['[data-testid="chat-input"]','div.ProseMirror[contenteditable="true"]','div[contenteditable="true"][data-testid*="input"]','div[contenteditable="true"]','textarea']
          : ['rich-textarea .ql-editor','.ql-editor[contenteditable="true"]','div[contenteditable="true"][role="textbox"]','div[contenteditable="true"]','textarea'];
      const input = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
      if (!input) return { ok:false, provider, error:'composer not found' };

      input.focus();
      const existing = 'value' in input ? input.value : (input.innerText || input.textContent || '');
      const combined = existing.trim() ? existing + '\\n\\n' + prompt : prompt;

      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(input, combined); else input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
      } else {
        input.focus();
        try {
          const range = document.createRange();
          range.selectNodeContents(input);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('insertText', false, combined);
        } catch {
          input.textContent = combined;
        }
        try {
          input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:combined }));
        } catch {
          input.dispatchEvent(new Event('input', { bubbles:true }));
        }
      }

      input.focus();
      return { ok:true, provider, inserted:true, submitted:false };
    })()`;

    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) throw new Error(result?.error || 'could not insert local file context');
    return { provider, path: file.path, size: file.size, inserted: true, submitted: false };
  }

  async function readReply() {
    const wc = getActiveWebContents();
    if (!wc || wc.isDestroyed()) throw new Error('no active browser tab');
    const provider = providerFromUrl(wc.getURL());
    if (!provider) throw new Error('active tab must be ChatGPT, Claude, or Gemini');

    const script = `(() => {
      const provider = ${JSON.stringify(provider)};
      const messageSelectors = provider === 'ChatGPT'
        ? ['[data-message-author-role="assistant"]','article[data-testid^="conversation-turn"] .markdown','article .markdown']
        : provider === 'Claude'
          ? ['[data-testid="assistant-message"]','.font-claude-message','[class*="font-claude-message"]','.prose']
          : ['model-response','.model-response-text','message-content','.markdown'];
      let messages = [];
      for (const selector of messageSelectors) {
        const found = Array.from(document.querySelectorAll(selector)).filter((node) => (node.innerText || '').trim());
        if (found.length) { messages = found; break; }
      }
      const node = messages.at(-1);
      if (!node) return { ok:false, provider, error:'assistant reply not found yet' };

      let codeBlocks = [];
      for (const selector of ['pre code','code-block','pre','.code-block']) {
        const found = Array.from(node.querySelectorAll(selector))
          .map((code) => (code.innerText || code.textContent || '').replace(/\\n$/, ''))
          .filter((value) => value.trim().length > 0);
        if (found.length) { codeBlocks = [...new Set(found)]; break; }
      }

      return {
        ok:true,
        provider,
        text:(node.innerText || node.textContent || '').trim(),
        codeBlocks,
      };
    })()`;

    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) throw new Error(result?.error || 'could not read latest assistant reply');
    const text = String(result.text || '');
    if (!text) throw new Error('latest assistant reply is empty');
    if (Buffer.byteLength(text, 'utf8') > MAX_AI_REPLY_BYTES) throw new Error('assistant reply is too large to import');

    const codeBlocks = Array.isArray(result.codeBlocks) ? result.codeBlocks.map(String) : [];
    if (codeBlocks.length !== 1) {
      throw new Error(`AI import requires exactly one rendered replacement code block; found ${codeBlocks.length}`);
    }
    const replacement = codeBlocks[0];
    if (Buffer.byteLength(replacement, 'utf8') > MAX_AI_REPLY_BYTES) throw new Error('replacement code block is too large to import');
    return { provider, text: `\`\`\`\n${replacement}\n\`\`\`` };
  }

  return { sendFile, readReply };
}

module.exports = {
  createAiBridge,
  providerFromUrl,
  buildPrompt,
  extractSingleReplacement,
  MAX_AI_CONTEXT_BYTES,
  MAX_AI_REPLY_BYTES,
};
