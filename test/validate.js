#!/usr/bin/env node
/**
 * Notebook Clipper - structural validation suite.
 *
 * No dependencies and no build step: the extension ships as plain files, so the
 * tests assert on those files directly. Run with `npm test` or `node test/validate.js`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, message: err.message });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(read('manifest.json'));

/** Every .js, .html and .css file that ships in the extension. */
function sourceFiles() {
  const skip = new Set(['.git', 'node_modules', 'lib', 'test']);
  const found = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(rel);
      } else if (/\.(js|html|css)$/.test(entry.name)) {
        found.push(rel);
      }
    }
  })('');
  return found;
}

/* ------------------------------------------------------------- manifest */

test('manifest is version 3', () => {
  assert(manifest.manifest_version === 3, `manifest_version is ${manifest.manifest_version}`);
});

test('manifest declares the required permissions', () => {
  const required = ['contextMenus', 'sidePanel', 'storage', 'tabs', 'scripting', 'activeTab'];
  const missing = required.filter((p) => !manifest.permissions.includes(p));
  assert(missing.length === 0, `missing permissions: ${missing.join(', ')}`);
});

test('manifest grants host access to NotebookLM only', () => {
  assert(
    JSON.stringify(manifest.host_permissions) ===
      JSON.stringify(['https://notebooklm.google.com/*']),
    `unexpected host_permissions: ${JSON.stringify(manifest.host_permissions)}`
  );
});

test('manifest declares no auto-injected content scripts', () => {
  assert(!manifest.content_scripts, 'content_scripts must be injected programmatically');
});

test('every file referenced by the manifest exists', () => {
  const refs = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    ...Object.values(manifest.icons),
  ];
  const missing = refs.filter((ref) => !exists(ref));
  assert(missing.length === 0, `missing files: ${missing.join(', ')}`);
});

/* ------------------------------------------------------ path references */

test('every path injected by executeScript exists', () => {
  const background = read('background.js');
  const refs = [...background.matchAll(/files:\s*\[([^\]]+)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((f) => f[1])
  );
  assert(refs.length > 0, 'no executeScript file references found');
  const missing = refs.filter((ref) => !exists(ref));
  assert(missing.length === 0, `missing injected files: ${missing.join(', ')}`);
});

test('every local asset referenced by the side panel HTML exists', () => {
  const html = read('sidebar/sidebar.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  const missing = refs
    .filter((ref) => !/^https?:/.test(ref))
    .filter((ref) => !exists(path.posix.join('sidebar', ref)));
  assert(missing.length === 0, `missing side panel assets: ${missing.join(', ')}`);
});

/* -------------------------------------------------------------- content */

test('the side panel HTML has no inline script', () => {
  const html = read('sidebar/sidebar.html');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
  assert(inline.length === 0, 'inline <script> breaks the extension CSP');
});

test('no source file uses eval or new Function', () => {
  const offenders = sourceFiles().filter((file) =>
    /\beval\s*\(|new\s+Function\s*\(/.test(read(file))
  );
  assert(offenders.length === 0, `eval found in: ${offenders.join(', ')}`);
});

test('the extension makes no external network calls', () => {
  const offenders = sourceFiles().filter((file) =>
    /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new\s+WebSocket/.test(read(file))
  );
  assert(offenders.length === 0, `network call found in: ${offenders.join(', ')}`);
});

test('Turndown is bundled locally and self-contained', () => {
  assert(exists('lib/turndown.js'), 'lib/turndown.js is missing');
  const lib = read('lib/turndown.js');
  assert(lib.includes('TurndownService'), 'lib/turndown.js does not define TurndownService');
  assert(!/\beval\s*\(/.test(lib), 'bundled Turndown uses eval');
});

/* ------------------------------------------------------ message contract */

test('every message type sent has a listener', () => {
  const files = ['background.js', 'sidebar/sidebar.js', 'content/notebooklm.js'];
  const sent = new Set();
  const handled = new Set();

  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/type:\s*'([A-Z_]+)'/g)) sent.add(m[1]);
    for (const m of text.matchAll(/message\.type === '([A-Z_]+)'/g)) handled.add(m[1]);
  }

  const orphans = [...sent].filter((type) => !handled.has(type));
  assert(orphans.length === 0, `message types with no listener: ${orphans.join(', ')}`);
});

/* ---------------------------------------------- devops-practices baseline */

test('VERSION matches the manifest version', () => {
  const version = read('VERSION').trim();
  assert(
    version === manifest.version,
    `VERSION (${version}) != manifest.version (${manifest.version})`
  );
});

test('VERSION matches the latest git tag', () => {
  let tag;
  try {
    tag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .replace(/^v/, '');
  } catch {
    return; // no tags yet: nothing to drift from
  }
  const version = read('VERSION').trim();
  assert(version === tag, `VERSION (${version}) != latest tag (${tag})`);
});

test('documentation pins refs to a version, not @main', () => {
  const docs = ['README.md', 'ROADMAP.md'].filter(exists);
  const violations = docs.flatMap((doc) =>
    read(doc)
      .split('\n')
      .map((line, i) => ({ doc, i: i + 1, line }))
      .filter(({ line }) => /@main\b|@master\b/.test(line))
      .map(({ doc: d, i, line }) => `${d}:${i}: ${line.trim()}`)
  );
  assert(violations.length === 0, `unpinned refs:\n${violations.join('\n')}`);
});

test('GitHub Actions uses are pinned to a tag', () => {
  const dir = '.github/workflows';
  if (!exists(dir)) return;
  const violations = [];
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    for (const m of read(`${dir}/${name}`).matchAll(/uses:\s*(\S+)/g)) {
      if (!/@v?\d|@[0-9a-f]{40}/.test(m[1])) violations.push(`${name}: ${m[1]}`);
    }
  }
  assert(violations.length === 0, `unpinned actions: ${violations.join(', ')}`);
});

/* ---------------------------------------------------------------- report */

let failed = 0;
for (const result of results) {
  if (result.ok) {
    console.log(`  PASS  ${result.name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${result.name}\n        ${result.message}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
