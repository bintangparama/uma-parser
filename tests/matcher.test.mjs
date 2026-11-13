import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCatalog,identifyCharacter,skillCandidates,resolveSkill,matchSkills,extractStats,buildGameJSON} from '../public/matcher.js';
import {classifyCircle} from '../public/symbols.js';
const catalog=createCatalog(JSON.parse(fs.readFileSync('skillnames.json')),JSON.parse(fs.readFileSync('umas.json')));
const line=(text,x=100,y=100,w=300,h=25)=>({text,bbox:{x0:x,x1:x+w,y0:y,y1:y+h}});
test('identifies a character and outfit, including OCR spelling errors',()=>{
  const found=identifyCharacter([line('[Full-Color Fangirling]'),line('Agnes DigitaI')],catalog,2048);
  assert.equal(found.character.id,'1019');assert.equal(found.outfit.id,'101901');
  const multi=identifyCharacter([line('Taiki Shuttle')],catalog,1600);assert.equal(multi.character.name,'Taiki Shuttle');assert.equal(multi.outfit,null);
  assert.equal(identifyCharacter([line('Change')],catalog,1600).character,null);
});
test('duplicate names use unique and inherited IDs appropriately',()=>{
  const group=skillCandidates('Budding Blossom',catalog)[0];
  assert.equal(resolveSkill(group,'Budding Blossom',{primary:true}).selectedId,'100511');
  assert.equal(resolveSkill(group,'Budding Blossom').selectedId,'900511');
  const louder=skillCandidates('Louder! Tracen Cheer!',catalog)[0];
  assert.equal(resolveSkill(louder,'Louder! Tracen Cheer!').selectedId,'910611');
});
test('circle variants remain ambiguous without evidence and preserve alternatives',()=>{
  const g=skillCandidates('Mile Corners',catalog)[0];
  assert.equal(resolveSkill(g,'Mile Corners').selectedId,'');
  assert.equal(resolveSkill(g,'Mile Corners ©').selectedId,'201041');
  assert.equal(resolveSkill(g,'Mile Corners O').selectedId,'201042');
  assert.equal(resolveSkill(g,'Mile Corners O',{circle:'◎'}).selectedId,'201041');
});
test('matches wrapped names by column, without treating UI labels as skills',()=>{
  const lines=[line('Career Info',700,500),line('Shooting for Victory! Lvl 3',100,600),line('Victoria por plancha',600,600),line('Pace Chaser',600,700),line('Speed Eater',100,720),line('Straightaways ©',600,728)];
  const result=matchSkills(lines,catalog,{width:1000,height:1600,outfitId:'101001'});
  assert.deepEqual(new Set(result.matches.map(m=>m.selectedId)),new Set(['100101','900141','201311','201082']));
  assert.equal(result.matches.some(m=>m.observed==='Career Info'),false);
});
test('sample schemas preserve IDs and keep unobserved fields unknown',()=>{
  for(const filename of ['Sample JSON.json','Sample JSON 2.json']){
    const expected=JSON.parse(fs.readFileSync(filename));
    for(const id of expected.skills)assert.ok(catalog.skills[id]);
    const exported=buildGameJSON({outfitId:expected.outfitId,stats:expected,settings:expected,matches:expected.skills.map(selectedId=>({selectedId}))});
    assert.deepEqual(exported,expected);
  }
  const empty=buildGameJSON({});assert.equal(empty.mood,null);assert.equal(empty.speed,null);assert.equal(empty.strategy,null);assert.deepEqual(empty.skills,[]);
});
test('extracts five stats in a shared row, excluding overall rank score',()=>{
  const lines=[line('24,068',50,350),...['1620','634','1221','582','1055'].map((s,i)=>line(s,90+i*200,450,80,35)),line('Track',100,545)];
  assert.deepEqual(extractStats(lines,1051,2048),{speed:1620,stamina:634,power:1221,guts:582,wisdom:1055});
});
test('ring analysis distinguishes single and double circles',()=>{
  const ring=double=>{
    const data=new Uint8ClampedArray(60*60*4).fill(255);
    for(let y=0;y<60;y++)for(let x=0;x<60;x++){
      const r=Math.hypot(x-30,y-30);
      if((r>15&&r<19)||(double&&r>7&&r<10)){const i=(y*60+x)*4;data[i]=135;data[i+1]=80;data[i+2]=35;}
    }
    return classifyCircle(data,60,60,35);
  };
  assert.equal(ring(false),'○');assert.equal(ring(true),'◎');
  assert.equal(classifyCircle(new Uint8ClampedArray(60*60*4).fill(255),60,60,35),null);
});

test('a full skill name beats a shorter exact substring',()=>{
  const result=matchSkills([line('Career Info',700,500),line('Unyielding Spirit',600,700)],catalog,{width:1000,height:1600});
  assert.equal(result.matches[0].selectedId,'201072');
});
test('compressed double circle in the real Taiki sample keeps the correct ID',async()=>{
  const {gunzipSync}=await import('node:zlib');
  const f=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/taiki-mile-circle.json.gz')));
  const circle=classifyCircle(new Uint8ClampedArray(f.pixels),f.width,f.height,f.expectedHeight);
  assert.equal(circle,'◎');
  assert.equal(resolveSkill(skillCandidates('Mile Straightaways O',catalog)[0],'Mile Straightaways O',{circle}).selectedId,'201031');
});
