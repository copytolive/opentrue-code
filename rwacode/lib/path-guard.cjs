'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createPathGuard(rootPath) {
  const root = fs.realpathSync.native(rootPath);

  function resolveExisting(inputPath = '.') {
    const raw = inputPath === '' ? '.' : inputPath;
    if (path.isAbsolute(raw)) throw new Error('absolute paths are not allowed');
    const candidate = fs.realpathSync.native(path.resolve(root, raw));
    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      throw new Error('path escapes canonical root');
    }
    return candidate;
  }

  function resolveWritable(inputPath) {
    if (!inputPath || path.isAbsolute(inputPath)) throw new Error('invalid relative path');
    const candidate = path.resolve(root, inputPath);
    const parent = fs.realpathSync.native(path.dirname(candidate));
    if (parent !== root && !parent.startsWith(root + path.sep)) {
      throw new Error('path escapes canonical root');
    }
    const normalized = path.join(parent, path.basename(candidate));
    if (normalized !== root && !normalized.startsWith(root + path.sep)) {
      throw new Error('path escapes canonical root');
    }
    return normalized;
  }

  return { root, resolveExisting, resolveWritable };
}

module.exports = { createPathGuard };
