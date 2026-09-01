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
const agent = fs.readFileSync(path.join(root, 'src', 'agent-ui.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('professional shell assets are loaded and syntax checked', () => {
  assert.match(index, /professional-shell-v2\.css/);
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

test('visual shell keeps the real two-tab preview contract and does not add decorative dead tabs', () => {
  assert.match(index, /id="previewTabButton"[^>]*>Preview<\/button>/);
  assert.match(index, /id="inspectorTabButton"[^>]*>Inspector<\/button>/);
  assert.doesNotMatch(index, />Console<\/button>/);
  assert.doesNotMatch(index, />Network<\/button>/);
});

test('professional shell establishes card-based left and right rails without replacing core workbench', () => {
  assert.match(css, /\.pro-sidebar-card/);
  assert.match(css, /\.preview-panel/);
  assert.match(css, /grid-template-columns:320px minmax\(580px,1fr\) 390px/);
  assert.match(shell, /filesPanel\.replaceChildren\(workspaceCard, explorerCard, sources, recent, foot\)/);
  assert.match(index, /id="browserSurface"/);
  assert.match(index, /id="agentWorkspaceTag"|agent-ui\.js/);
});
