/**
 * Cut a release: bump the version and write its CHANGELOG section, or print
 * that section as a release body.
 *
 *   node scripts/release.mjs prepare --bump=<patch|minor|major>
 *   node scripts/release.mjs body [--output=<file>]
 *   node scripts/release.mjs check
 *
 * `prepare` runs in release-pr.yml and `body` runs twice: there for the pull
 * request, and in release.yml for the GitHub release, so the two always say
 * what CHANGELOG.md says.
 *
 * conventional-changelog writes the section rather than a `git log` here: it
 * groups by type, links every commit, lifts `BREAKING CHANGE:` notes into their
 * own section, and leaves out the `build(deps)` and `ci` noise a raw log is
 * mostly made of.
 *
 * `body` then asks GitHub, through `gh`, what git cannot say: who wrote each
 * entry and in which pull request, who contributed for the first time, and
 * the compare link. The names it mentions are what the release page draws its
 * Contributors avatars from. In CI `gh` reads `GH_TOKEN`.
 *
 * `check` runs in release.yml before anything is published. The section is
 * written when the release pull request is cut, so a feat or fix merged into
 * main after that would ship in the tag with no line anywhere: the next
 * section starts from the new tag. It refuses until the section names every
 * such commit, and the cure is to run Release PR again with the same bump.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConventionalChangelog } from 'conventional-changelog';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHANGELOG = join(ROOT, 'CHANGELOG.md');
const PACKAGE = join(ROOT, 'package.json');
const PKG = JSON.parse(readFileSync(PACKAGE, 'utf8'));
const REPO = /github\.com\/([^/]+\/[^/.]+)/.exec(PKG.repository.url)[1];

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
else if (command === 'check') check();
else fail('Usage: release.mjs prepare --bump=<patch|minor|major> | body [--output=<file>] | check');

async function prepare(flags) {
  // Refused rather than ignored: an ignored `--dry-run` would read like a
  // rehearsal and still rewrite three files.
  const bump = flags.length === 1 && /^--bump=(patch|minor|major)$/.exec(flags[0])?.[1];
  if (!bump) fail('Usage: release.mjs prepare --bump=<patch|minor|major>. There is no dry run, this always writes.');

  // The bump is picked by hand in the Actions tab, so nothing else connects it
  // to the commits. Below 1.0 a breaking change rides a minor, from 1.0 a major.
  const current = PKG.version;
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

  const section = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim()
    .split('\n')
    .map(withPullRequest)
    .join('\n')
    .replace(/^###\s+(.+)$/gm, (_, heading) => {
      // conventional-changelog already puts ⚠ before BREAKING CHANGES.
      const plain = heading.replace(/^⚠️?\s*/, '');
      const emoji = EMOJI.find(([pattern]) => pattern.test(heading.toLowerCase()))?.[1] ?? '✨';
      return `### ${emoji} ${plain}`;
    });

  const text = [section, footer()].filter(Boolean).join('\n\n');
  if (output) writeFileSync(output, `${text}\n`);
  else console.log(text);
}

// The attribution goes right after the commit link, which is not always the
// end of the line: a `Closes #12` footer comes after it as `, closes #12`. A
// rebase merge leaves no `(#123)` in the subject, so the pull request comes
// from GitHub's commit-to-PR index, and a commit pushed without one names its
// author alone.
function withPullRequest(line) {
  const link = /\/commit\/([0-9a-f]{40})\)\)/.exec(line);
  if (!link) return line;
  const sha = link[1];
  const at = link.index + link[0].length;
  const pr = gh([
    `repos/${REPO}/commits/${sha}/pulls`,
    '--jq',
    '[.[] | select(.merged_at != null and .base.ref == "main")][0] | if . then "\\(.user.login) \\(.number)" else "" end',
  ]);
  let by = '';
  if (pr) {
    const [login, number] = pr.split(' ');
    by = ` by @${login} in #${number}`;
  } else {
    const login = gh([`repos/${REPO}/commits/${sha}`, '--jq', '.author.login // ""']);
    if (login) by = ` by @${login}`;
  }
  return `${line.slice(0, at)}${by}${line.slice(at)}`;
}

// New Contributors and the compare link, taken from the notes GitHub would
// generate itself. The release pull request is opened by github-actions, which
// is not a contributor to anything the section lists.
function footer() {
  const tag = `v${PKG.version}`;
  const previous = previousTag();
  const notes = gh([
    '--method',
    'POST',
    `repos/${REPO}/releases/generate-notes`,
    '-f',
    `tag_name=${tag}`,
    '-f',
    `target_commitish=${process.env.GITHUB_SHA ?? 'main'}`,
    ...(previous ? ['-f', `previous_tag_name=${previous}`] : []),
    '--jq',
    '.body',
  ]);
  const newcomers = (notes.split('## New Contributors')[1] ?? '')
    .split('\n')
    .filter(line => line.startsWith('* @') && !line.startsWith('* @github-actions[bot]'));
  const full = /^\*\*Full Changelog\*\*: .+$/m.exec(notes)?.[0];
  return [newcomers.length ? `### 👋 New Contributors\n\n${newcomers.join('\n')}` : '', full ?? '']
    .filter(Boolean)
    .join('\n\n');
}

function check() {
  const lines = readFileSync(CHANGELOG, 'utf8').split('\n');
  const start = lines.findIndex(line => line.startsWith('## '));
  if (start < 0 || !lines[start].includes(`[${PKG.version}]`)) {
    fail(`CHANGELOG.md does not open with a ${PKG.version} section. Run Release PR again.`);
  }
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const section = lines.slice(start, end < 0 ? undefined : end).join('\n');

  const missing = execFileSync('git', ['log', '--format=%H %s', `${previousTag()}..HEAD`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(line => /^[0-9a-f]{40} (feat|fix|perf|revert)(\([^)]*\))?!?:/.test(line))
    .filter(line => !section.includes(line.slice(0, 40)));
  if (missing.length > 0) {
    fail(
      [
        `CHANGELOG.md misses ${missing.length} commit(s) that would ship in v${PKG.version}:`,
        ...missing.map(line => `  ${line.slice(0, 7)} ${line.slice(41)}`),
        'main moved after the release pull request was cut. Run Release PR again with the same bump.',
      ].join('\n'),
    );
  }
  console.log(`CHANGELOG.md covers everything since ${previousTag()}`);
}

// The newest release tag other than the one being cut. `lastTag()` is the
// same question asked before the bump, when the current version is that tag.
function previousTag() {
  return execFileSync('git', ['tag', '--sort=-v:refname'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .find(tag => /^v\d+\.\d+\.\d+$/.test(tag) && tag !== `v${PKG.version}`);
}

function gh(args) {
  return execFileSync('gh', ['api', ...args], { cwd: ROOT, encoding: 'utf8' }).trim();
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
