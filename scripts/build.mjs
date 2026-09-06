import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/noiseless', { recursive: true });
await build({entryPoints:['src/main.ts'], bundle:true, platform:'node', target:'es2022', format:'cjs', external:['obsidian','electron'], outfile:'dist/noiseless/main.js', sourcemap:false});
for (const file of ['manifest.json','styles.css']) await copyFile(file, `dist/noiseless/${file}`);
