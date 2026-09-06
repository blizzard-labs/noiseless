import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('artifacts/visual',{recursive:true});
await build({entryPoints:['scripts/preview.ts'],bundle:true,platform:'browser',format:'iife',outfile:'artifacts/visual/ui.js',alias:{'node:crypto':'./scripts/preview-crypto.ts'}});
const css=await readFile('styles.css','utf8');
await writeFile('artifacts/visual/index.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Noiseless · visual verification</title><style>
:root{--background-primary:#fff;--background-secondary:#f4f5f4;--background-modifier-border:#e3e5e4;--text-normal:#242827;--text-muted:#626a66;--text-faint:#909894;--text-warning:#9b6421;--interactive-accent:#719183;--text-on-accent:#fff;--font-interface:system-ui}
body{margin:0;padding:24px;background:#e8ebe9}body.dark{--background-primary:#1e1e1e;--background-secondary:#262626;--background-modifier-border:#383838;--text-normal:#dedede;--text-muted:#aaa;--text-faint:#777;--text-warning:#dab077;background:#151515}#frame{box-sizing:border-box;background:var(--background-primary);padding:16px;border-radius:12px;max-width:100%;margin:0}#status{font:12px system-ui;color:var(--text-muted);margin-bottom:12px}
${css}</style></head><body><div id="status">Rendering…</div><main id="frame"></main><script src="ui.js"></script></body></html>`);
const frames=['today','everything','progress'].flatMap(page=>['light','dark'].map(mode=>`<section><h2>${page} · ${mode} · 360px</h2><iframe title="${page} ${mode}" src="index.html?page=${page}&mode=${mode}&width=360"></iframe></section>`));
await writeFile('artifacts/visual/matrix.html',`<!doctype html><html><head><meta charset="utf-8"><title>Noiseless layout matrix</title><style>body{font:14px system-ui;background:#ecefeb;padding:16px}main{display:grid;grid-template-columns:repeat(2,420px);gap:20px}h2{font-size:15px}iframe{border:0;width:420px;height:900px;border-radius:10px}</style></head><body><h1>Noiseless · narrow layout checks</h1><main>${frames.join('')}</main></body></html>`);
