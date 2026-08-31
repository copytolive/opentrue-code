'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createPathGuard(rootPath) {
  const root = fs.realpathSync.native(rootPath);

  function assertInside(candidate) {
    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      throw new Error('path escapes canonical root');
    }
    return candidate;
  }

  function resolveExisting(inputPath = '.') {
    const raw = inputPath === '' ? '.' : inputPath;
    if (path.isAbsolute(raw)) throw new Error('absolute paths are not allowed');
    return assertInside(fs.realpathSync.native(path.resolve(root, raw)));
  }

  function resolveWritable(inputPath) {
    if (!inputPath || path.isAbsolute(inputPath)) throw new Error('invalid relative path');
    const lexical = path.resolve(root, inputPath);
    const parent = assertInside(fs.realpathSync.native(path.dirname(lexical)));
    const normalized = assertInside(path.join(parent, path.basename(lexical)));

    // If the destination already exists, resolve the destination itself so a
    // writable symlink cannot redirect an apparently in-root write outside the
    // canonical workspace. For a new file, the real parent check above is the
    // boundary.
    try {
      fs.lstatSync(normalized);
      return assertInside(fs.realpathSync.native(normalized));
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
      return normalized;
    }
  }

  return { root, resolveExisting, resolveWritable };
}

module.exports = { createPathGuard };
