// Converts the Lancaster Sensorimotor Norms CSV (Lynott et al., 2020) into public/norms.json.
//
// Usage: node scripts/build-norms.mjs
// Input:  data/raw/lancaster_norms.csv (manual download, see HANDOVER.md section 4.3)
// Output: public/norms.json

import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = path.join(__dirname, '..', 'data', 'raw', 'lancaster_norms.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'norms.json');

const DIMS = [
  'Auditory',
  'Gustatory',
  'Haptic',
  'Interoceptive',
  'Olfactory',
  'Visual',
  'Foot_leg',
  'Hand_arm',
  'Head',
  'Mouth',
  'Torso',
];

function parseCsvLine(line) {
  // Minimal CSV parser: handles quoted fields with embedded commas.
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

async function main() {
  let stat;
  try {
    stat = statSync(INPUT_PATH);
  } catch {
    console.error(`Missing input file: ${INPUT_PATH}`);
    console.error('Download the Lancaster Sensorimotor Norms CSV (Lynott et al., 2020) from its');
    console.error('OSF repository and save it there. See HANDOVER.md section 4.3.');
    process.exit(1);
  }
  console.log(`Reading ${INPUT_PATH} (${(stat.size / 1024).toFixed(0)} KB)`);

  const rl = createInterface({ input: createReadStream(INPUT_PATH), crlfDelay: Infinity });

  let header = null;
  let wordCol = -1;
  const dimCols = {};
  const words = {};
  let rowCount = 0;

  for await (const line of rl) {
    if (line.trim() === '') continue;

    if (!header) {
      header = parseCsvLine(line).map((h) => h.trim());
      wordCol = header.findIndex((h) => /^word$/i.test(h));
      if (wordCol === -1) {
        console.error(`Could not find a "Word" column. Headers found: ${header.join(', ')}`);
        process.exit(1);
      }
      for (const dim of DIMS) {
        const colName = `${dim}.mean`;
        const idx = header.findIndex((h) => h === colName);
        if (idx === -1) {
          console.error(
            `Expected column "${colName}" not found. Headers found: ${header.join(', ')}`,
          );
          process.exit(1);
        }
        dimCols[dim] = idx;
      }
      continue;
    }

    const fields = parseCsvLine(line);
    const rawWord = fields[wordCol];
    if (rawWord === undefined) continue;
    const word = rawWord.trim().toLowerCase();
    if (!/^[a-z]+$/.test(word)) continue;

    const values = DIMS.map((dim) => {
      const v = Number.parseFloat(fields[dimCols[dim]]);
      return Number.isFinite(v) ? v : null;
    });
    if (values.some((v) => v === null)) continue;

    words[word] = values.map((v) => Math.round(v * 100) / 100);
    rowCount++;
  }

  console.log(`Parsed ${rowCount} words with complete data across all ${DIMS.length} dimensions.`);

  // Unweighted mean/sd across all norm words, per dimension.
  const n = rowCount;
  const mean = DIMS.map((_, dimIdx) => {
    let sum = 0;
    for (const v of Object.values(words)) sum += v[dimIdx];
    return sum / n;
  });
  const sd = DIMS.map((_, dimIdx) => {
    let sumSq = 0;
    for (const v of Object.values(words)) sumSq += (v[dimIdx] - mean[dimIdx]) ** 2;
    return Math.sqrt(sumSq / n);
  });

  const output = {
    dims: DIMS,
    words,
    mean: mean.map((v) => Math.round(v * 10000) / 10000),
    sd: sd.map((v) => Math.round(v * 10000) / 10000),
  };

  const json = JSON.stringify(output);
  writeFileSync(OUTPUT_PATH, json);

  const sizeMB = Buffer.byteLength(json) / (1024 * 1024);
  console.log(`Wrote ${OUTPUT_PATH} (${sizeMB.toFixed(2)} MB, ${rowCount} words).`);
  if (sizeMB > 3) {
    console.warn(
      'Output exceeds ~3MB. Consider switching to a words array + flat Float32 base64 payload (see HANDOVER.md 9.1).',
    );
  }
}

main();
