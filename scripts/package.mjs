import {mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await mkdir('artifacts',{recursive:true});
await copyFile('README.md','dist/noiseless/README.md');
await copyFile('VERIFICATION.md','dist/noiseless/VERIFICATION.md');
execFileSync('zip',['-qr','../artifacts/noiseless-plugin.zip','noiseless'],{cwd:'dist'});
execFileSync('zip',['-qr','artifacts/noiseless-starter-vault.zip','starter-vault']);
execFileSync('zip',['-qr','artifacts/noiseless-example-vault.zip','example-vault']);
console.log('Packaged plugin, clean starter vault, and fictional example vault.');
