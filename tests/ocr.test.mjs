import test from 'node:test';
import assert from 'node:assert/strict';
import { planTiles, collectLines, processPixels, readingOrder } from '../public/ocr-utils.js';
test('arbitrary sizes have bounded processing canvases and contiguous ownership', () => {
  for (const [w,h] of [[811,1600],[1051,2048],[966,1600],[400,18000],[12000,2000],[1,1]]) {
    const tiles = planTiles(w,h);
    assert.equal(tiles[0].keepTop,0); assert.equal(tiles.at(-1).keepBottom,h);
    for (let i=0;i<tiles.length;i++) {
      assert.ok(tiles[i].width <= 1800); assert.ok(Math.round(tiles[i].height*tiles[i].scale)<=1800);
      if(i) assert.equal(tiles[i].keepTop,tiles[i-1].keepBottom);
    }
  }
});
test('overlap produces one copy of each line in source coordinates', () => {
  const tiles=planTiles(900,3000), seam=tiles[0].keepBottom;
  const make=(t)=>[{paragraphs:[{lines:[{text:'Repeated title',confidence:90,bbox:{x0:20,y0:(seam-8-t.y)*t.scale,x1:200,y1:(seam+8-t.y)*t.scale}}]}]}];
  const lines=tiles.slice(0,2).flatMap(t=>collectLines(make(t),t));
  assert.equal(lines.length,1); assert.equal(lines[0].bbox.y0,seam-8);
});
test('brown filtering isolates sample text and removes card background',()=>{
  const data=new Uint8ClampedArray([132,79,34,255,255,211,90,255,210,210,230,255]);
  processPixels(data,'game'); assert.equal(data[0],0); assert.equal(data[4],255); assert.equal(data[8],255);
});
test('reading order keeps two columns in row order',()=>{
  const line=(text,x,y)=>({text,bbox:{x0:x,y0:y,x1:x+80,y1:y+20}});
  assert.deepEqual(readingOrder([line('bottom',0,80),line('right',200,12),line('left',0,10)]).map(l=>l.text),['left','right','bottom']);
});
