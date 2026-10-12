'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const asset = '/app/packages/twenty-server/dist/front/assets/metadataStoreState-DBJES_Hf.js';
const expectedHash = '776786ca71c0c213c81fba8af669c4bfee2e8caf677e87aac1986bc5bc031f65';
const before = 'const r=await M(a);for(const[n,d]of r)e.set(n,d)';
// A blocked IndexedDB read must not hold ReactDOM's initial mount forever.
// The timeout returns no cached metadata; the app can fetch current metadata.
// A late IndexedDB result is ignored so it cannot overwrite newer network state.
const after = 'let o;const r=await Promise.race([M(a),new Promise(n=>{o=setTimeout(()=>n([]),3000)})]);clearTimeout(o);for(const[n,d]of r)e.set(n,d)';

const source = fs.readFileSync(asset, 'utf8');
const hash = crypto.createHash('sha256').update(source).digest('hex');
if (hash !== expectedHash) throw new Error(`Unexpected metadata asset hash: ${hash}`);
if (source.split(before).length !== 2) throw new Error('Metadata hydration anchor is not unique');
const patched = source.replace(before, after);
const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], {
  input: patched,
  encoding: 'utf8',
});
if (syntax.status !== 0) throw new Error(syntax.stderr || 'Metadata asset syntax failed');
fs.writeFileSync(asset, patched);
if (fs.readFileSync(asset, 'utf8') !== patched) throw new Error('Metadata asset read-back failed');
console.log(JSON.stringify({asset, before: hash, after: crypto.createHash('sha256').update(patched).digest('hex')}));
