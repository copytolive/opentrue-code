import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/real-mac-fixes.css', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../src/real-mac-ui.js', import.meta.url), 'utf8');
const explorerOps = fs.readFileSync(new URL('../electron/explorer-ops.cjs', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');


test('native macOS traffic lights are not duplicated by shell chrome', () => {
  assert.match(html, /class="traffic"/);
  assert.match(css, /\.traffic\{display:none!important\}/);
  assert.match(css, /padding-left:94px!important/);
});

test('responsive three-surface grid cannot push Inspector offscreen', () => {
  assert.match(css, /grid-template-columns:minmax\(280px,var\(--files-w\)\) minmax\(0,1fr\) minmax\(320px,var\(--right-w\)\)/);
  assert.match(css, /\.inspector-card>b[\s\S]*text-overflow:ellipsis/);
  assert.match(css, /\.root-lock>span:last-child[\s\S]*overflow-wrap:anywhere/);
});

test('mobile and tablet preview are true centered device rectangles', () => {
  assert.match(css, /\.preview-surface\.tablet[\s\S]*width:min\(768px,100%\)[\s\S]*justify-self:center/);
  assert.match(css, /\.preview-surface\.mobile[\s\S]*width:min\(390px,100%\)[\s\S]*justify-self:center/);
  assert.match(ui, /deviceIcons/);
  assert.match(ui, /window\.dispatchEvent\(new Event\('resize'\)\)/);
});

test('Explorer menu keeps a short useful VS Code-like operation set', () => {
  for (const label of [
    'New File…', 'New Folder…', 'Reveal in Finder', 'Open in Images Preview',
    'Open in Terminal', 'Find in Folder…', 'Add Folder to Chat',
    'Cut', 'Copy', 'Paste', 'Copy Path', 'Copy Relative Path', 'Rename…', 'Delete',
  ]) assert.ok(ui.includes(label), `missing Explorer action: ${label}`);
  assert.doesNotMatch(ui, /Share<\/span>/);
});

test('new file and folder operations target the selected folder like VS Code', () => {
  assert.match(ui, /const destination = meta\.type === 'directory' \? meta\.path : \(s\?\.currentDir \|\| '\.'\)/);
  assert.match(ui, /api\.files\.create\(destination, name\.trim\(\), action === 'new-folder' \? 'directory' : 'file'\)/);
});

test('Explorer utility actions remain root-locked and do not expose generic shell execution', () => {
  assert.match(explorerOps, /createPathGuard\(CANONICAL_ROOT\)/);
  assert.match(explorerOps, /fs:openTerminal/);
  assert.match(explorerOps, /spawn\('\/usr\/bin\/open', \['-a', appName, absolute\]/);
  assert.match(explorerOps, /copying symbolic links is not allowed/);
  assert.doesNotMatch(preload, /execute|spawn|child_process|shell:/);
});

test('real-Mac parity layer is loaded last so it can safely correct shell-only geometry', () => {
  assert.match(html, /clean-shell\.css[\s\S]*real-mac-fixes\.css/);
  assert.match(html, /workspace-ui\.js[\s\S]*real-mac-ui\.js/);
});
