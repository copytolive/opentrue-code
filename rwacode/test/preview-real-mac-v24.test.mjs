import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const preload = read('electron/preload.cjs');
const observability = read('electron/preview-observability.cjs');
const runtime = read('src/preview-real-mac-v24.js');
const css = read('src/preview-real-mac-v24.css');
const pkg = JSON.parse(read('package.json'));

test('Preview V2.4 assets load after the functional right panel and are syntax gated', () => {
  assert.match(preload, /functionalRightPanelScript/);
  assert.match(preload, /script\.addEventListener\('load', ensurePreviewV24/);
  assert.match(preload, /preview-real-mac-v24\.css/);
  assert.match(preload, /preview-real-mac-v24\.js/);
  assert.match(pkg.scripts.check, /node --check src\/preview-real-mac-v24\.js/);
});

test('Preview load sets visible WebContentsView bounds before navigation', () => {
  const loadStart = runtime.indexOf('async function loadPreview()');
  const boundsCall = runtime.indexOf('await syncVisibleBounds();', loadStart);
  const navigationCall = runtime.indexOf('await api.preview.load(value);', loadStart);
  assert.ok(loadStart >= 0);
  assert.ok(boundsCall > loadStart);
  assert.ok(navigationCall > boundsCall);
  assert.match(runtime, /rect\.width < 40 \|\| rect\.height < 40/);
  assert.match(runtime, /Preview viewport is not visible yet/);
});

test('Preview controls remain distinct and fit a narrow rail', () => {
  assert.match(runtime, /preview-external-label[^>]*>Open</);
  assert.match(runtime, /Full Screen/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) max-content!important/);
  assert.match(css, /#previewGoButton\{min-width:68px!important/);
  assert.match(css, /preview-external-live/);
  assert.match(css, /preview-fullscreen-button/);
});

test('native Preview removes the shell frame only while the WebContentsView is active', () => {
  assert.match(runtime, /surface\.classList\.toggle\('preview-native-active', mode === 'live' \|\| mode === 'loading'\)/);
  assert.match(css, /\.preview-surface\.preview-native-active/);
  assert.match(css, /border-color:transparent!important/);
  assert.match(css, /border-radius:0!important/);
});

test('Inspector retains the last real Preview viewport instead of reporting hidden 0 by 0', () => {
  assert.match(runtime, /lastViewport = \{ width:0, height:0 \}/);
  assert.match(runtime, /rect\.width >= 40 && rect\.height >= 40/);
  assert.match(runtime, /refreshInspectorFromLastViewport/);
  assert.match(runtime, /lastViewport\.width && lastViewport\.height/);
});

test('internal Electron development warning is not presented as Preview app console output', () => {
  assert.match(observability, /isInternalElectronWarning/);
  assert.match(observability, /Electron Security Warning/);
  assert.match(observability, /if \(isInternalElectronWarning\(message, sourceId\)\) return/);
});

test('Preview V2.4 remains provider neutral and NO_AI_API safe', () => {
  for (const source of [runtime, css, observability]) {
    assert.doesNotMatch(source, /chatgpt\.com|claude\.ai|gemini\.google\.com|api\.openai\.com|api\.anthropic\.com/i);
    assert.doesNotMatch(source, /auto.?send|dom.?scrap|cookie.?extract|captcha.?bypass/i);
  }
});
