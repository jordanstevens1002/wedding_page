import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function isGeneratedPath(file) {
  return /(?:^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|requirements\.lock)$/.test(file)
    || /^(frontend\/src\/api\/generated\/|vendor\/|third_party\/)/.test(file);
}

export function summariseDiff(numstat) {
  const totals = { handwritten: 0, generated: 0, binary: [] };
  for (const record of numstat.split('\0').filter(Boolean)) {
    const match = record.match(/^(\d+|-)\t(\d+|-)\t([^]*)$/);
    if (!match) throw new Error('Invalid git numstat record');
    const [, additions, deletions, file] = match;
    if (additions === '-' || deletions === '-') totals.binary.push(file);
    else totals[isGeneratedPath(file) ? 'generated' : 'handwritten'] += Number(additions) + Number(deletions);
  }
  return totals;
}

export function checkPullRequest(pr, totals) {
  const errors = [];
  if (!/^(feat|fix|docs|test|refactor|build|ci|chore|perf|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S[^\n]*$/.test(pr.title ?? '')) {
    errors.push('Use a Conventional Commit PR title: type(scope): description');
  }
  const release = pr.base?.ref === 'main' && pr.head?.ref === 'develop'
    && Boolean(pr.base?.repo?.full_name)
    && pr.base?.repo?.full_name === pr.head?.repo?.full_name;
  if (pr.base?.ref !== 'develop' && !release) {
    errors.push('Feature PRs target develop; only same-repository develop release PRs target main.');
  }
  // Ignore references inside fenced examples and inline code.
  const body = (pr.body ?? '').replace(/```[^]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const issue = release ? /\bCloses\s+#[1-9]\d*\b/i : /\bRefs\s+#[1-9]\d*\b/i;
  if (!issue.test(body)) errors.push(release ? 'Release PRs need Closes #123.' : 'Feature PRs need Refs #123.');
  const exception = body.match(/^\s*(?:-\s*)?Size exception:\s*(.+)$/im)?.[1].trim();
  if (!release && totals.handwritten > 1000 && (!exception || /^(none|n\/a|no|tbd)\.?$/i.test(exception))) {
    errors.push('Above 1,000 handwritten changed lines, explain the cohesive Size exception or split the PR.');
  }
  return errors;
}

export function readDiff(base, head, cwd = process.cwd()) {
  const options = { encoding: 'utf8', cwd };
  const commit = ref => execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], options).trim();
  const range = `${commit(base)}...${commit(head)}`;
  return summariseDiff(execFileSync('git', ['diff', '--numstat', '-z', '--no-renames', range, '--'], options));
}

export function main(args = process.argv.slice(2)) {
  let totals;
  let errors = [];
  if (args[0] === '--diff' && args.length === 3) totals = readDiff(args[1], args[2]);
  else if (args[0] === '--event' && args.length === 2) {
    const pr = JSON.parse(readFileSync(args[1], 'utf8')).pull_request;
    if (!pr) throw new Error('Expected a pull_request event');
    totals = readDiff(pr.base.sha, pr.head.sha);
    errors = checkPullRequest(pr, totals);
  } else throw new Error('Usage: pr-policy.mjs --diff BASE HEAD | --event EVENT_JSON');
  console.log(`Handwritten changed lines: ${totals.handwritten}\nGenerated changed lines: ${totals.generated}\nBinary files: ${totals.binary.length}`);
  if (totals.binary.length) console.log(`Inspect binary files manually: ${totals.binary.join(', ')}`);
  if (totals.handwritten > 1500) console.log('Above 1,500 handwritten lines: split or obtain explicit maintainer agreement; release promotions are exempt.');
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
