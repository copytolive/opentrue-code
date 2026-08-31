'use strict';

const MAX_AI_CONTEXT_BYTES = 256 * 1024;
const MAX_AI_REPLY_BYTES = 1024 * 1024;

function providerFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com')) return 'ChatGPT';
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
    if (host === 'gemini.google.com') return 'Gemini';
  } catch {}
  return null;
}

function buildPrompt(relativePath, content, instruction) {
  const task = String(instruction || '').trim() || 'Read this local file and explain the important points.';
  return [
    'RWACode LOCAL FILE CONTEXT',
    `Selected file: ${relativePath}`,
    '',
    `User instruction: ${task}`,
    '',
    'Security boundary: you are receiving only the selected file content. You do not have direct filesystem access.',
    'If the instruction asks you to modify the file, return the COMPLETE replacement file contents in exactly one fenced code block. Do not return a partial patch.',
    'If the instruction only asks for analysis, answer normally.',
    '',
    `<rwacode_file path="${relativePath}">`,
    content,
    '</rwacode_file>',
  ].join('\n');
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
      const host = location.hostname.toLowerCase();
      const provider = host.includes('chatgpt.com') ? 'ChatGPT' : host.includes('claude.ai') ? 'Claude' : host === 'gemini.google.com' ? 'Gemini' : null;
      if (!provider) return { ok:false, error:'unsupported provider page' };
      const selectors = provider === 'ChatGPT'
        ? ['#prompt-textarea','[data-testid="prompt-textarea"]','textarea','[contenteditable="true"]']
        : provider === 'Claude'
          ? ['[data-testid="chat-input"]','div.ProseMirror[contenteditable="true"]','[contenteditable="true"]','textarea']
          : ['rich-textarea [contenteditable="true"]','.ql-editor[contenteditable="true"]','[contenteditable="true"]','textarea'];
      const input = selectors.map((s) => document.querySelector(s)).find(Boolean);
      if (!input) return { ok:false, provider, error:'composer not found' };
      input.focus();
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(input, prompt); else input.value = prompt;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
      } else {
        const range = document.createRange();
        range.selectNodeContents(input);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, prompt);
        input.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:prompt }));
      }
      const sendSelectors = provider === 'ChatGPT'
        ? ['[data-testid="send-button"]','button[aria-label*="Send"]','button[aria-label*="Kirim"]']
        : provider === 'Claude'
          ? ['button[aria-label*="Send"]','button[aria-label*="Kirim"]','button[data-testid*="send"]']
          : ['button[aria-label*="Send"]','button[aria-label*="Kirim"]','button.send-button'];
      const send = sendSelectors.map((s) => document.querySelector(s)).find((el) => el && !el.disabled);
      if (send) { send.click(); return { ok:true, provider, submitted:true }; }
      return { ok:true, provider, submitted:false, error:'context inserted; send button was not detected' };
    })()`;

    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) throw new Error(result?.error || 'could not send file context');
    return { provider, path: file.path, size: file.size, submitted: Boolean(result.submitted), note: result.error || null };
  }

  async function readReply() {
    const wc = getActiveWebContents();
    if (!wc || wc.isDestroyed()) throw new Error('no active browser tab');
    const provider = providerFromUrl(wc.getURL());
    if (!provider) throw new Error('active tab must be ChatGPT, Claude, or Gemini');

    const script = `(() => {
      const host = location.hostname.toLowerCase();
      const provider = host.includes('chatgpt.com') ? 'ChatGPT' : host.includes('claude.ai') ? 'Claude' : host === 'gemini.google.com' ? 'Gemini' : null;
      const selectors = provider === 'ChatGPT'
        ? ['[data-message-author-role="assistant"]','article[data-testid^="conversation-turn"] .markdown','article .markdown']
        : provider === 'Claude'
          ? ['[data-testid="assistant-message"]','.font-claude-message','[class*="font-claude-message"]','.prose']
          : ['model-response','.model-response-text','message-content','.markdown'];
      let nodes = [];
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector)).filter((node) => (node.innerText || '').trim());
        if (found.length) { nodes = found; break; }
      }
      const node = nodes.at(-1);
      if (!node) return { ok:false, provider, error:'assistant reply not found yet' };
      return { ok:true, provider, text:(node.innerText || node.textContent || '').trim() };
    })()`;

    const result = await wc.executeJavaScript(script, true);
    if (!result?.ok) throw new Error(result?.error || 'could not read latest assistant reply');
    const text = String(result.text || '');
    if (!text) throw new Error('latest assistant reply is empty');
    if (Buffer.byteLength(text, 'utf8') > MAX_AI_REPLY_BYTES) throw new Error('assistant reply is too large to import');
    return { provider, text };
  }

  return { sendFile, readReply };
}

module.exports = { createAiBridge, providerFromUrl, buildPrompt, MAX_AI_CONTEXT_BYTES, MAX_AI_REPLY_BYTES };
