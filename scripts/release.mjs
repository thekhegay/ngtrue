/**
 * Cut a release: bump the version and write its CHANGELOG section, or print
 * that section as a release body.
 *
 *   node scripts/release.mjs prepare --bump=<patch|minor|major>
 *   node scripts/release.mjs body [--output=<file>]
 *
 * `prepare` runs in release-pr.yml and `body` runs twice: there for the pull
 * request, and in release.yml for the GitHub release, so the two always say
 * what CHANGELOG.md says.
 *
 * conventional-changelog writes the section rather than a `git log` here: it
 * groups by type, links every commit, lifts `BREAKING CHANGE:` notes into their
 * own section, and leaves out the `build(deps)` and `ci` noise a raw log is
 * mostly made of.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConventionalChangelog } from 'conventional-changelog';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHANGELOG = join(ROOT, 'CHANGELOG.md');
const PACKAGE = join(ROOT, 'package.json');

const EMOJI = [
  [/break|⚠/, '⚠️'],
  [/feature/, '🚀'],
  [/bug ?fix/, '🐛'],
  [/perf/, '⚡'],
  [/revert/, '⏪'],
];

const [command, ...flags] = process.argv.slice(2);

if (command === 'prepare') await prepare(flags);
else if (command === 'body') body(flags);
else fail('Usage: release.mjs prepare --bump=<patch|minor|major> | body [--output=<file>]');

async function prepare(flags) {
  // Refused rather than ignored: an ignored `--dry-run` would read like a
  // rehearsal and still rewrite three files.
  const bump = flags.length === 1 && /^--bump=(patch|minor|major)$/.exec(flags[0])?.[1];
  if (!bump) fail('Usage: release.mjs prepare --bump=<patch|minor|major>. There is no dry run, this always writes.');

  // The bump is picked by hand in the Actions tab, so nothing else connects it
  // to the commits. Below 1.0 a breaking change rides a minor, from 1.0 a major.
  const current = JSON.parse(readFileSync(PACKAGE, 'utf8')).version;
  const floor = current.startsWith('0.') ? ['minor', 'major'] : ['major'];
  const breaking = breakingSince(lastTag());
  if (breaking.length > 0 && !floor.includes(bump)) {
    fail(
      [
        `Refusing --bump=${bump}: ${breaking.length} breaking commit(s) since ${lastTag()}.`,
        ...breaking.map(subject => `  ${subject}`),
        `On ${current} a breaking change needs --bump=${floor[0]}.`,
      ].join('\n'),
    );
  }

  const version = execFileSync('npm', ['version', bump, '--no-git-tag-version', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .replace(/^v/, '');

  // Links come from `repository` in package.json rather than the git remote,
  // which can be an ssh alias that is no web address.
  const generator = new ConventionalChangelog(ROOT).readPackage(PACKAGE).loadPreset('conventionalcommits');
  let section = '';
  for await (const chunk of generator.write()) section += chunk;

  // Under the H1, not above it: a blind prepend strands the heading between
  // the newest section and the one before.
  const existing = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '';
  const rest = existing.replace(/^# Changelog\s*\n+/, '');
  writeFileSync(CHANGELOG, `# Changelog\n\n${section.replace(/\n*$/, '\n\n')}${rest}`.replace(/\n+$/, '\n'));

  console.log(version);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
}

function body(flags) {
  const output = flags.find(flag => flag.startsWith('--output='))?.slice('--output='.length);
  if (flags.length > (output ? 1 : 0)) fail('Usage: release.mjs body [--output=<file>]');

  const lines = readFileSync(CHANGELOG, 'utf8').split('\n');
  const start = lines.findIndex(line => line.startsWith('## '));
  if (start < 0) fail('CHANGELOG.md has no release section.');
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));

  const text = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim()
    .replace(/^###\s+(.+)$/gm, (_, heading) => {
      // conventional-changelog already puts ⚠ before BREAKING CHANGES.
      const plain = heading.replace(/^⚠️?\s*/, '');
      const emoji = EMOJI.find(([pattern]) => pattern.test(heading.toLowerCase()))?.[1] ?? '✨';
      return `### ${emoji} ${plain}`;
    });

  if (output) writeFileSync(output, `${text}\n`);
  else console.log(text);
}

function lastTag() {
  return execFileSync('git', ['tag', '--sort=-v:refname'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .find(tag => /^v\d+\.\d+\.\d+$/.test(tag));
}

function breakingSince(tag) {
  if (!tag) return [];
  return execFileSync('git', ['log', '-z', '--format=%s%n%b', `${tag}..HEAD`], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .map(commit => commit.trim())
    .filter(commit => /^[a-z]+(\([^)]*\))?!:/.test(commit) || /^BREAKING[ -]CHANGE:/m.test(commit))
    .map(commit => commit.split('\n')[0]);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
