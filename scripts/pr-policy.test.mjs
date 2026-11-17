import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkPullRequest, readDiff, summariseDiff } from './pr-policy.mjs';

const repo = { full_name: 'example/wedding' };
function feature(overrides = {}) {
  return { title: 'feat(content): preview a palette', body: 'Refs #12\nSize exception: None.',
    base: { ref: 'develop', repo }, head: { ref: 'feat/12-palette', repo }, ...overrides };
}
const count = handwritten => ({ handwritten, generated: 0, binary: [] });

test('sizes count additions and deletions, separating generated output and binary files', () => {
  const result = summariseDiff('5\t3\tbackend/migrations/0001.py\0'
    + '7\t2\tdocs/design.md\0' + '100\t20\tfrontend/package-lock.json\0'
    + '20\t10\tfrontend/src/api/generated/client.ts\0' + '8\t2\tbackend/openapi.json\0'
    + '-\t-\tphoto.png\0');
  assert.deepEqual(result, { handwritten: 17, generated: 160, binary: ['photo.png'] });
});

test('unusual filenames cannot change numstat parsing or execute commands', () => {
  assert.equal(summariseDiff('1\t2\tname\nwith\ttabs;$(false).md\0').handwritten, 3);
  assert.throws(() => summariseDiff('unrecognised'), /Invalid/);
});

test('small feature PRs pass and the 1,000-line boundary is inclusive', () => {
  assert.deepEqual(checkPullRequest(feature(), count(1000)), []);
  assert.deepEqual(checkPullRequest(feature({ title: 'fix(api)!: reject incompatible answers' }), count(10)), []);
});

test('large feature PRs require a real explanation rather than a template placeholder', () => {
  assert.match(checkPullRequest(feature(), count(1001)).join('\n'), /Size exception/);
  assert.match(checkPullRequest(feature({ body: 'Refs #12\nSize exception: TBD' }), count(1200)).join('\n'), /Size exception/);
  assert.deepEqual(checkPullRequest(feature({ body: 'Refs #12\n- Size exception: Atomic migration and its recovery tests.' }), count(1200)), []);
});

test('bad titles, absent issue references and direct main features fail', () => {
  const errors = checkPullRequest(feature({ title: 'Palette changes', body: 'Refs #', base: { ref: 'main', repo } }), count(10));
  assert.equal(errors.length, 3);
  assert.ok(checkPullRequest(feature({ body: '`Refs #12`' }), count(10)).length);
});

test('only same-repository develop promotions are releases with closing references', () => {
  const release = feature({ title: 'chore(release): prepare v1.0.0', body: 'Closes #12',
    base: { ref: 'main', repo }, head: { ref: 'develop', repo } });
  assert.deepEqual(checkPullRequest(release, count(20000)), []);
  assert.match(checkPullRequest({ ...release, body: 'Refs #12' }, count(10)).join('\n'), /Closes/);
  assert.match(checkPullRequest({ ...release, head: { ref: 'develop', repo: { full_name: 'fork/wedding' } } }, count(10)).join('\n'), /same-repository/);
});

test('a real Git merge-base diff includes tests/deletions and separates lockfiles', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wedding-policy-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  try {
    git('init', '--initial-branch=develop', '--quiet');
    git('config', 'user.name', 'Fictional Test');
    git('config', 'user.email', 'test@example.invalid');
    writeFileSync(path.join(cwd, 'old.md'), 'old\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'chore: baseline');
    git('switch', '--quiet', '-c', 'feat/1-demo');
    rmSync(path.join(cwd, 'old.md'));
    mkdirSync(path.join(cwd, 'tests'));
    writeFileSync(path.join(cwd, 'tests', 'demo test.mjs'), 'first\nsecond\n');
    writeFileSync(path.join(cwd, 'package-lock.json'), '{}\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'feat: demo');
    assert.deepEqual(readDiff('develop', 'HEAD', cwd), { handwritten: 3, generated: 1, binary: [] });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
