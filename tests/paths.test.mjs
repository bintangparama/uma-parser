import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('OCR and dictionary assets resolve under root and repository URLs',async()=>{
  const source=await readFile(new URL('../public/asset-paths.js',import.meta.url),'utf8');
  for(const base of ['https://example.github.io/','https://example.github.io/ocr-project/']){
    const moduleSource=source.replace('import.meta.url',JSON.stringify(base+'asset-paths.js'));
    const {assetURL}=await import('data:text/javascript,'+encodeURIComponent(moduleSource));
    for(const path of ['vendor/worker.min.js','vendor/core/','vendor/lang','data/skillnames.json','data/umas.json'])assert.equal(assetURL(path),base+path);
  }
});
