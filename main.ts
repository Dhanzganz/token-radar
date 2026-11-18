// Token Radar — entrypoint.
//
//   node main.ts [--input /input/snapshot.json]
//
// Reads the sealed snapshot, prices every pre-token protocol on it with the radar-5
// model (a category level and a size slope, fitted on the traded record in log space —
// see lib/model.ts and MODEL_NOTES.md), and writes the entry's outputs:
//
//   board.json    the ranked board, the model's fitted levels and its validation
//   data.js       the dashboard's dataset, as one script (no fetch, no network)
//   dashboard/    the page the screenshots show, copied from this repo
//   screenshots/  the entry's screenshots, copied from this repo
//   dossier.json  the vendored dossier of the dashboard, written last and byte-exact
//
// Two runs on the same snapshot write the same bytes: the model is medians and a
// Theil–Sen slope over a fixed record, with no clock, no randomness and no network
// anywhere in the run.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardIssue, buildRadar, dataScript, MODEL_VERSION, parseSnapshot, SnapshotError } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The repo this entry ships from: dashboard/ and screenshots/ are copied out of it. */
const REPO = dirname(fileURLToPath(import.meta.url));

/** The dossier caps this competition sets: its text and image limits, verbatim. */
const DOSSIER_CAPS = {
  text_max_bytes: 65536,
  screenshots: { max: 8, max_bytes: 512288 },
  dashboard: { max_files: 64, max_bytes: 1048576 },
} as const;

/** The snapshot's path: --input's value, else /input/snapshot.json. */
function inputPath(argv: string[]): string {
  const at = argv.indexOf('--input');
  if (at >= 0) {
    const value = argv[at + 1];
    if (value === undefined) throw new SnapshotError('--input needs a path after it');
    return value;
  }
  return '/input/snapshot.json';
}

/** The output directory: MAKEFUN_OUTPUT_DIR when set, else /output. */
function outputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : '/output';
}

/** Copy a directory tree of plain files, names in sorted order so the copy is stable. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  const entries = readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (entry.isDirectory()) copyTree(join(from, entry.name), join(to, entry.name));
    else if (entry.isFile()) copyFileSync(join(from, entry.name), join(to, entry.name));
  }
}

function main(): number {
  let snapshot;
  try {
    snapshot = parseSnapshot(readFileSync(inputPath(process.argv.slice(2)), 'utf8'));
  } catch (err) {
    process.stderr.write(`token-radar: ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token-radar: the board does not pass: ${issue}\n`);
    return 3;
  }

  const out = outputDir();
  mkdirSync(out, { recursive: true });
  const boardJson = {
    as_of: snapshot.as_of,
    model_version: MODEL_VERSION,
    rows: board,
    validation: radar.validation,
    multiples: radar.multiples,
    global_multiple: radar.global_multiple,
    reference_tvl_usd: radar.reference_tvl_usd,
    size_slope: radar.size_slope,
  };
  writeFileSync(join(out, 'board.json'), `${JSON.stringify(boardJson, null, 2)}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const dashboardFrom = join(REPO, 'dashboard');
  if (!existsSync(dashboardFrom) || !statSync(dashboardFrom).isDirectory()) {
    process.stderr.write('token-radar: the repo carries no dashboard/ to ship\n');
    return 4;
  }
  copyTree(dashboardFrom, join(out, 'dashboard'));

  const shotsFrom = join(REPO, 'screenshots');
  if (!existsSync(shotsFrom) || readdirSync(shotsFrom).filter((n) => !n.startsWith('.')).length === 0) {
    process.stderr.write('token-radar: the repo carries no screenshots/ to ship\n');
    return 4;
  }
  copyTree(shotsFrom, join(out, 'screenshots'));

  // The dossier goes last: it digests the dashboard and the screenshots just written.
  const dossier = buildDossier(out, DOSSIER_CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);

  const v = radar.validation;
  process.stdout.write(
    `token-radar ${MODEL_VERSION}: scanned ${radar.scanned} protocols, board ${board.length} rows ` +
      `(${radar.watchlist_size} watchlist + ${radar.early_size} early), hold-out median miss x${v.median_factor} ` +
      `(${v.within_2x_pct}% within 2x) vs naive x${v.baseline_median_factor}\n`,
  );
  return 0;
}

process.exitCode = main();
