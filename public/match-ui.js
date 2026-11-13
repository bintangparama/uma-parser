import { assetURL } from './asset-paths.js';
import {createCatalog, identifyCharacter, matchSkills, extractStats, buildGameJSON} from './matcher.js';
import {imageCircleReader} from './symbols.js';
const $=id=>document.getElementById(id);
let catalog=null, current=null;
const catalogReady=Promise.all(['skillnames','umas'].map(async name=>{
  const response=await fetch(assetURL(`data/${name}.json`));if(!response.ok)throw new Error(`Could not load ${name}.json`);return response.json();
})).then(([skills,umas])=>{catalog=createCatalog(skills,umas);return catalog;});
// Handle failures locally even if nobody starts OCR.
catalogReady.catch(error=>{$('catalog-status').textContent=`Name lists unavailable: ${error.message}. Restart localhost and retry.`;});
function option(value,text){const el=document.createElement('option');el.value=value;el.textContent=text;return el;}
function label(text,field){const el=document.createElement('label');el.append(document.createTextNode(text),field);return el;}
function select(options,empty='Not provided'){const el=document.createElement('select');el.append(option('',empty));for(const [value,text] of options)el.append(option(value,text));return el;}
const outfit=select([],'Character / outfit not identified');outfit.id='outfit-match';outfit.setAttribute('aria-label','Character and outfit');
$('character-field').append(label('Character & outfit',outfit));
const statInputs={};for(const name of ['speed','stamina','power','guts','wisdom']){const input=document.createElement('input');input.type='number';input.min='0';input.max='9999';input.placeholder='Unknown';input.setAttribute('aria-label',name);statInputs[name]=input;$('matched-stats').append(label(name[0].toUpperCase()+name.slice(1),input));}
const settings={};
const grades=['S','A','B','C','D','E','F','G'].map(g=>[g,g]);
for(const [key,title,values] of [
  ['strategy','Strategy',[['Oonige','Runaway (Oonige)'],['Nige','Front Runner (Nige)'],['Senkou','Pace Chaser (Senkou)'],['Sasi','Late Surger (Sasi)'],['Oikomi','End closer (Oikomi)']]],
  ['distanceAptitude','Distance aptitude',grades],['surfaceAptitude','Surface aptitude',grades],['strategyAptitude','Strategy aptitude',grades],
  ['mood','Mood',[['-2','Awful (−2)'],['-1','Bad (−1)'],['0','Normal (0)'],['1','Good (1)'],['2','Great (2)']]]
]){const el=select(values);el.setAttribute('aria-label',title);settings[key]=el;if(key==='mood')el.value='2';$('game-settings').append(label(title,el));}
function outputJSON(){
  if(!current)return null;
  return buildGameJSON({outfitId:outfit.value,stats:Object.fromEntries(Object.entries(statInputs).map(([k,v])=>[k,v.value])),settings:Object.fromEntries(Object.entries(settings).map(([k,v])=>[k,v.value])),matches:current.matches});
}
function update(){
  if(!current)return;
  const json=outputJSON();$('game-json').textContent=JSON.stringify(json,null,2);
  const reviews=current.matches.filter(m=>m.review&&!m.confirmed).length;
  const missing=Object.entries(json).filter(([k,v])=>v===null).map(([k])=>k);
  $('match-count').textContent=`${json.skills.length} skills selected${reviews?` · ${reviews} to review`:''}`;
  $('export-note').textContent=missing.length?`Not determined: ${missing.join(', ')}. These export as null until you choose a value.`:'All export fields are filled. Review the matches before using the JSON.';
  $('game-export').disabled=false;$('game-copy').disabled=false;
}
function renderRows(){
  $('skill-matches').replaceChildren();
  current.matches.forEach((match,index)=>{
    const row=document.createElement('tr');
    const source=document.createElement('td');source.textContent=match.observed;
    if(match.symbolPreview){const preview=document.createElement('img');preview.src=match.symbolPreview;preview.alt='Original text ending, for circle variant review';preview.className='symbol-preview';source.append(preview);}
    const cell=document.createElement('td');
    const choice=select(match.alternatives.map(a=>[a.id,`${a.name} · ${a.id}`]),'Exclude / unresolved');
    choice.setAttribute('aria-label',`Skill ${index+1}: ${match.observed}`);choice.value=match.selectedId;
    cell.append(choice);
    const detail=document.createElement('small');detail.textContent=`${Math.round(match.score*100)}% name similarity${match.variantSource==='image'?' · circle read from image':''}${match.primary?' · unique skill':''}`;cell.append(detail);
    const state=document.createElement('td'),badge=document.createElement('span');badge.className='match-state'+(match.review&&!match.confirmed?' review':'');badge.textContent=match.confirmed?'Confirmed':match.review?'Review':'Matched';state.append(badge);
    if(match.review&&!match.confirmed){const confirm=document.createElement('button');confirm.textContent='Confirm';confirm.disabled=!match.selectedId;confirm.addEventListener('click',()=>{match.confirmed=true;renderRows();update();});state.append(confirm);}
    choice.addEventListener('change',()=>{match.selectedId=choice.value;match.confirmed=true;renderRows();update();});
    row.append(source,cell,state);$('skill-matches').append(row);
  });
  update();
}
export function resetMatches(){current=null;$('matching').hidden=true;$('game-export').disabled=true;$('game-copy').disabled=true;}
export async function showMatches(result,bitmap){
  const expected=result;
  current={result,matches:[]};$('matching').hidden=false;$('catalog-status').textContent='Matching local names…';
  try{
    await catalogReady;
    if(current?.result!==expected)return;
    outfit.replaceChildren(option('','Character / outfit not identified'));
    catalog.characters.forEach(c=>c.outfits.forEach(o=>outfit.append(option(o.id,`${c.name} ${o.name} · ${o.id}`))));
    const identified=identifyCharacter(result.lines,catalog,result.height);
    outfit.value=identified.outfit?.id||'';
    $('identity-note').textContent=identified.character?`${identified.character.name}${identified.outfit?` · ${identified.outfit.name}`:' · Outfit could not be confirmed; please choose above.'}`:'Character could not be confirmed. Please choose above.';
    const matched=matchSkills(result.lines,catalog,{width:result.width,height:result.height,outfitId:outfit.value,circleAt:imageCircleReader(bitmap)});
    current.matches=matched.matches;
    const stats=extractStats(result.lines,result.width,result.height);
    Object.entries(statInputs).forEach(([key,input])=>input.value=stats[key]??'');
    Object.entries(settings).forEach(([key,input])=>input.value=key==='mood'?'2':'');
    $('unmatched').textContent=matched.unmatched.length?matched.unmatched.join('\n'):'No additional text to review.';
    $('catalog-status').textContent=`Matched against ${Object.keys(catalog.skills).length.toLocaleString()} skill IDs and ${catalog.characters.length} characters on your device.`;
    const list=$('all-skills');list.replaceChildren();Object.entries(catalog.skills).forEach(([id,names])=>list.append(option(`${names[0]} · ${id}`,'')));
    renderRows();
  }catch(error){$('catalog-status').textContent=`Matching failed: ${error.message}. Raw OCR is still available.`;}
}
for(const input of [outfit,...Object.values(statInputs),...Object.values(settings)])input.addEventListener('change',update);
$('add-skill').addEventListener('click',()=>{
  if(!catalog||!current)return;
  const input=$('manual-skill'),id=input.value.split(' · ').at(-1).trim();
  if(!catalog.skills[id]){$('manual-note').textContent='Choose a full skill name and ID from the suggestions, or enter a valid ID.';return;}
  if(current.matches.some(m=>m.selectedId===id)){$('manual-note').textContent='That skill is already selected.';return;}
  current.matches.push({observed:'Added manually',selectedId:id,alternatives:[{id,name:catalog.skills[id][0]}],score:1,confirmed:true,review:false});
  input.value='';$('manual-note').textContent='Skill added.';renderRows();
});
$('game-export').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(outputJSON(),null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=current.result.source.replace(/\.[^.]+$/,'')+'.build.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('game-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(outputJSON(),null,2));$('export-note').textContent='Build JSON copied.';}catch{$('export-note').textContent='Clipboard unavailable. Select the JSON preview and copy it manually.';}});
