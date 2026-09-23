/**
 * Generate the API reference from TSDoc into markdown, or check the committed
 * copy against what the sources say now.
 *
 *   node scripts/api-docs.mjs            rewrite docs/api/
 *   node scripts/api-docs.mjs --check    fail if docs/api/ is stale
 *
 * Plain `.mjs` rather than TypeScript, because the alternative is a TypeScript
 * runner in `devDependencies` for two scripts, in a repository whose only build
 * step is `tsc`.
 *
 * typedoc does the extraction rather than a generator written here. The reason
 * is the reason for the check itself: a hand-rolled extractor reads the source
 * with regular expressions, and the members it fails to match are invisible
 * from birth — it reports a complete-looking document that is missing whatever
 * it could not parse, and nothing ever says so. typedoc uses the TypeScript
 * compiler, so a member it does not report is a member that is not exported,
 * and a type it prints is the type the compiler resolved rather than the text
 * somebody typed. Its dependency tree is five small packages; a generator that
 * approximated it would cost more to trust than to install.
 */
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Application } from 'typedoc';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMMITTED = join(ROOT, 'docs/api');

const check = process.argv.includes('--check');

/**
 * `hideGenerator` and the two page-level toggles keep the output free of
 * anything that changes on its own. A footer naming the typedoc version, or a
 * timestamp, would make the freshness check fail on a dependency bump and pass
 * on an actual API change that happened in the same commit.
 */
async function generate(out, docsRoot) {
  const app = await Application.bootstrapWithPlugins({
    entryPoints: ['src/root/index.ts', 'src/testing/index.ts', 'src/node/index.ts'],
    tsconfig: 'tsconfig.build.json',
    plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
    out,
    readme: 'none',
    hideGenerator: true,
    githubPages: false,
    excludeInternal: true,
    sort: ['source-order'],
    logLevel: 'Warn',
    // Source links are pinned to the branch, not to the commit. typedoc embeds
    // the current sha by default, so every commit would make the committed
    // reference stale against itself and the freshness check would fail on a
    // change it is not there to catch.
    gitRevision: 'main',
    // The theme writes a sidebar for VitePress to import. Without it every new
    // export would need a hand-edited nav entry, which is the hand-maintained
    // docs site this repository is trying not to have.
    //
    // It is a parameter because the sidebar holds links relative to this root,
    // so a check that generated into a bare temp directory would differ from
    // the committed copy in every link and report a fresh reference as stale.
    // The comparison run rebuilds the same `docs/api` shape under the temp root.
    docsRoot,
  });

  const project = await app.convert();
  if (project === undefined) throw new Error('typedoc could not read the sources.');

  const validation = app.logger.hasErrors();
  if (validation) throw new Error('typedoc reported errors; see above.');

  await app.generateOutputs(project);
}

async function tree(dir) {
  const files = new Map();
  const walk = async current => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.set(relative(dir, full), await readFile(full, 'utf8'));
    }
  };
  await walk(dir);
  return files;
}

async function main() {
  if (!check) {
    await rm(COMMITTED, { recursive: true, force: true });
    await mkdir(COMMITTED, { recursive: true });
    await generate(COMMITTED, join(ROOT, 'docs'));
    const written = await tree(COMMITTED);
    console.log(`api-docs: wrote ${written.size} file(s) to docs/api/`);
    return;
  }

  const scratch = await mkdtemp(join(tmpdir(), 'ngtrue-api-'));
  try {
    const out = join(scratch, 'docs/api');
    await generate(out, join(scratch, 'docs'));
    const fresh = await tree(out);
    const committed = await tree(COMMITTED);

    const stale = [];
    for (const [file, content] of fresh) {
      if (!committed.has(file)) stale.push(`${file} is missing from docs/api/`);
      else if (committed.get(file) !== content) stale.push(`${file} differs from what the sources say`);
    }
    for (const file of committed.keys()) {
      if (!fresh.has(file)) stale.push(`${file} is in docs/api/ and documents nothing that still exists`);
    }

    if (stale.length > 0) {
      console.error('api-docs: the committed reference is stale.\n');
      for (const problem of stale) console.error(`  ${problem}`);
      console.error('\nRun `npm run docs:api` and commit the result.');
      process.exitCode = 1;
      return;
    }

    // A comparison of two empty trees is equal, and that is the shape of a
    // silent failure here: an entry-point rename that made typedoc emit
    // nothing would report the committed copy as fresh.
    if (fresh.size === 0) {
      console.error('api-docs: typedoc emitted nothing, so the comparison proved nothing.');
      process.exitCode = 1;
      return;
    }

    console.log(`api-docs: docs/api/ matches the sources (${String(fresh.size)} file(s)).`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

await stat(join(ROOT, 'package.json'));
process.chdir(ROOT);
await main();
