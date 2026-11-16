// Tactical Strike: Sandstone Outpost — threejs-fps-02 entrypoint (Node 22, standard library only).
// Copies game/ and screenshots/ into /output (or MAKEFUN_OUTPUT_DIR locally) without removing the
// mounted /output directory itself, then writes /output/dossier.json via vendor/makefun-threejs.ts.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shotsSrc = join(here, 'screenshots');

mkdirSync(out, { recursive: true });
for (const child of readdirSync(out)) {
  rmSync(join(out, child), { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
