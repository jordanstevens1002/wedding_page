import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function isPrivatePath(file) {
  const parts = file.split('/');
  const name = parts.at(-1);
  return ['data', 'runtime', 'media', 'uploads', 'backups', 'exports'].includes(parts[0])
    || parts.some(part => ['.aws', '.agents', '.codex'].includes(part))
    || (name === '.env' || name.startsWith('.env.')) && name !== '.env.example'
    || /\.(pem|key|sqlite3?|dump|bak|log)$/i.test(name);
}

export function checkMarkdownLinks(file, content, tracked) {
  const errors = [];
  const prose = content.replace(/```[^]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^)]*)?\s*\)/g;
  for (const match of prose.matchAll(links)) {
    const url = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue;
    let target;
    try {
      const pathname = decodeURIComponent(url.split(/[?#]/)[0]);
      if (!pathname) continue;
      target = path.posix.normalize(pathname.startsWith('/')
        ? pathname.slice(1) : path.posix.join(path.posix.dirname(file), pathname)).replace(/\/$/, '');
    } catch {
      errors.push(`${file}: invalid link encoding ${url}`);
      continue;
    }
    if (target !== '.' && !tracked.has(target) && ![...tracked].some(name => name.startsWith(`${target}/`))) {
      errors.push(`${file}: relative link is not tracked: ${url}`);
    }
  }
  return errors;
}

export function checkRepository(files, read) {
  const tracked = new Set(files);
  const errors = [];
  for (const required of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE',
    'docs/design.md', 'docs/roadmap.md', '.gitignore', '.dockerignore',
    '.github/pull_request_template.md']) {
    if (!tracked.has(required)) errors.push(`Missing required file: ${required}`);
  }
  for (const file of files) {
    if (isPrivatePath(file)) {
      errors.push(`Private runtime or credential path is tracked: ${file}`);
      continue;
    }
    if (!/\.(md|mjs|yml|yaml|json|toml|py|ts|tsx|css|html|sh)$/.test(file)
      && !['.gitignore', '.dockerignore', '.editorconfig'].includes(file)) continue;
    const content = read(file);
    if (content && !content.endsWith('\n')) errors.push(`${file}: missing final newline`);
    if (/\r/.test(content)) errors.push(`${file}: expected LF line endings`);
    if (/[\t ]+$/m.test(content)) errors.push(`${file}: trailing whitespace`);
    if (file.endsWith('.md')) errors.push(...checkMarkdownLinks(file, content, tracked));
  }
  return errors;
}

export function main() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const errors = checkRepository(files, file => readFileSync(file, 'utf8'));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Repository checks passed (${files.length} tracked files).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
