import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'src', 'professional-shell-v2.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'professional-shell-v2.css'), 'utf8');
const css21 = fs.readFileSync(path.join(root, 'src', 'professional-shell-v21.css'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'src', 'agent-ui.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('professional shell assets are loaded and syntax checked', () => {
  assert.match(index, /professional-shell-v2\.css/);
  assert.match(index, /professional-shell-v21\.css/);
  assert.match(index, /professional-shell-v2\.js/);
  assert.match(pkg.scripts.check, /node --check src\/professional-shell-v2\.js/);
});

test('professional shell exposes exactly the three approved workspace context sources', () => {
  for (const source of ['local', 'github', 'googledrive']) {
    assert.match(shell, new RegExp(`data-source=\\"${source}\\"`));
  }
  assert.doesNotMatch(shell, /data-source=\"server\"/i);
  assert.match(agent, /<option value="local">@Local<\/option>/);
  assert.match(agent, /<option value="github">@GitHub<\/option>/);
  assert.match(agent, /<option value="googledrive">@GoogleDrive<\/option>/);
  assert.doesNotMatch(agent, /<option value="server">/i);
});

test('browser home is provider neutral from first paint', () => {
  assert.match(index, /class="browser-chat-home"/);
  assert.match(index, />Browser Chat<\/h1>/);
  assert.match(index, /Human-controlled · NO_AI_API/);
  assert.doesNotMatch(index, /data-url="https:\/\/(?:chatgpt\.com|claude\.ai|gemini\.google\.com)"/i);
  assert.doesNotMatch(index, /<b>(?:ChatGPT|Claude|Gemini)<\/b>/i);
  assert.match(index, /<span>Browser<\/span><b>Native web chat<\/b>/);
  assert.match(shell, /Provider-neutral browser home/);
  assert.doesNotMatch(shell, /chatgpt\.com|claude\.ai|gemini\.google\.com/i);
});

test('visual shell keeps the real two-tab preview contract and does not add decorative dead tabs', () => {
  assert.match(index, /id="previewTabButton"[^>]*>Preview<\/button>/);
  assert.match(index, /id="inspectorTabButton"[^>]*>Inspector<\/button>/);
  assert.doesNotMatch(index, />Console<\/button>/);
  assert.doesNotMatch(index, />Network<\/button>/);
});

test('professional shell establishes card-based left and right rails without replacing core workbench', () => {
  assert.match(css, /\.pro-sidebar-card/);
  assert.match(css, /\.preview-panel/);
  assert.match(css21, /grid-template-columns:344px minmax\(620px,1fr\) 440px/);
  assert.match(css21, /\.browser-chat-home/);
  assert.match(shell, /filesPanel\.replaceChildren\(workspaceCard, explorerCard, sources, recent, foot\)/);
  assert.match(index, /id="browserSurface"/);
  assert.match(index, /id="agentWorkspaceTag"|agent-ui\.js/);
});

test('V2.2 polish keeps long workspace paths readable and gives the universal browser home a deliberate workbench card', () => {
  assert.match(css21, /white-space:nowrap!important/);
  assert.match(css21, /text-overflow:ellipsis!important/);
  assert.match(css21, /\.browser-chat-home\{[\s\S]*border:1px solid rgba\(44,57,72,.78\)!important/);
  assert.match(css21, /\.new-tab-page\{[\s\S]*padding:46px 36px!important/);
  assert.match(css21, /\.preview-surface\{min-height:410px!important\}/);
  assert.doesNotMatch(css21, /ChatGPT|Claude|Gemini|DeepSeek/i);
});

test('V2.3 context source cards are functional controls over the authoritative workspace selector', () => {
  assert.match(shell, /function activateContextSource\(type\)/);
  assert.match(shell, /tag\.value = type/);
  assert.match(shell, /tag\.dispatchEvent\(new Event\('change', \{ bubbles:true \}\)\)/);
  assert.match(shell, /row\.setAttribute\('role', 'button'\)/);
  assert.match(shell, /row\.setAttribute\('tabindex', '0'\)/);
  assert.match(shell, /row\.addEventListener\('click'/);
  assert.match(shell, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(shell, /syncContextSourceSelection\(\)/);
  assert.match(agent, /el\('agentWorkspaceTag'\)\.onchange=updateSourceUi/);
});

test('V2.3 uses native macOS traffic lights without overlapping the RWACode brand', () => {
  assert.match(shell, /dataset\.platform = \/Macintosh\|Mac OS X\/i/);
  assert.match(css21, /\[data-platform="darwin"\] \.traffic\{display:none!important\}/);
  assert.match(css21, /\[data-platform="darwin"\] \.topbar\{padding-left:86px!important\}/);
});
