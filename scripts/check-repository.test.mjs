import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMarkdownLinks, checkRepository, isPrivatePath } from './check-repository.mjs';

test('runtime paths are rejected even if force-added; fictional source fixtures remain possible', () => {
  for (const file of ['data/wedding.json', 'media/photo.jpg', 'backups/archive.tar',
    'exports/answers.csv', '.env', 'backend/.env.production', 'operator/private.key',
    'backend/private.sqlite3', 'x/.aws/credentials']) {
    assert.equal(isPrivatePath(file), true, file);
  }
  for (const file of ['.env.example', 'backend/.env.example', 'frontend/src/media.ts',
    'tests/fixtures/fictional-party.json', 'docs/design.md']) {
    assert.equal(isPrivatePath(file), false, file);
  }
});

test('relative documentation links resolve nested paths, encoded spaces, images and anchors', () => {
  const tracked = new Set(['README.md', 'docs/design.md', 'docs/My Guide.md', 'docs/icon.svg']);
  assert.deepEqual(checkMarkdownLinks('docs/design.md', [
    '[Home](../README.md#intro)', '[Guide](My%20Guide.md)', '![Icon](icon.svg)',
    '[Root](/README.md)', '[External](https://example.invalid/path)', '[Anchor](#local)',
    '[Quoted](<My Guide.md>)', '[Directory](../docs/)',
  ].join('\n'), tracked), []);
});

test('untracked targets, repository escapes and malformed URLs fail without network access', () => {
  const errors = checkMarkdownLinks('docs/design.md',
    '[Missing](missing.md) [Escape](../../outside) [Malformed](%ZZ.md)', new Set(['docs/design.md']));
  assert.equal(errors.length, 3);
  assert.match(errors[0], /not tracked/);
  assert.match(errors[2], /encoding/);
});

test('documentation examples in code blocks do not create fake link failures', () => {
  assert.deepEqual(checkMarkdownLinks('README.md',
    '```md\n[Example](missing.md)\n```\n`[Inline](missing.md)`', new Set()), []);
});

test('hygiene detects missing files and bad text while refusing to read private files', () => {
  const errors = checkRepository(['README.md', '.env'], file => {
    assert.equal(file, 'README.md');
    return '# Demo\r\nTrailing space \nMissing newline';
  });
  assert.ok(errors.some(error => error.includes('Missing required file')));
  assert.ok(errors.some(error => error.includes('Private runtime')));
  assert.ok(errors.some(error => error.includes('final newline')));
  assert.ok(errors.some(error => error.includes('LF line endings')));
  assert.ok(errors.some(error => error.includes('trailing whitespace')));
});
