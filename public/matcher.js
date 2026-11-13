// No network or DOM dependencies. The reference dictionaries are the only source of names/IDs.
export function normalize(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/\b(?:lvl|lv|lyl)\s*\d+\b/gi, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function baseName(name) { return normalize(name.replace(/[○◎◯〇×]/g, '')); }
function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1]+1, row[j]+1, row[j-1]+(a[i-1] === b[j-1] ? 0 : 1));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
function textScore(observed, expected) {
  const raw = baseName(observed), target = baseName(expected);
  if (raw === target) return 1;
  const a = raw.split(' '), b = target.split(' ');
  let best = similarity(raw, target);
  // OCR can include icons, a level, or another card on the same line.
  for (let size = Math.max(1,b.length-1); size <= b.length+1; size++) {
    for (let i=0; i+size<=a.length; i++) {
      const window = a.slice(i,i+size).join(' ');
      const score = similarity(window,target) - .25 * (a.length-size)/a.length;
      if (score > best) best = score;
    }
  }
  return best;
}
export function createCatalog(skills, umas) {
  const groups = new Map();
  for (const [id, names] of Object.entries(skills)) for (const name of names) {
    const key = baseName(name);
    if (!groups.has(key)) groups.set(key, { key, name, entries: [] });
    groups.get(key).entries.push({ id, name });
  }
  const characters = Object.entries(umas).map(([id, uma]) => ({ id, name: uma.name.find(Boolean), names: uma.name.filter(Boolean), outfits: Object.entries(uma.outfits).map(([id,name]) => ({id,name})) }));
  return { groups: [...groups.values()], characters, skills };
}
export function identifyCharacter(lines, catalog, height) {
  const header = lines.filter(l => !height || !l.bbox || l.bbox.y0 < height*.35);
  const candidates = catalog.characters.map(character => {
    const score = Math.max(0, ...header.flatMap(l => character.names.map(n => textScore(l.text,n))));
    const outfits = character.outfits.map(outfit => ({...outfit, score: Math.max(0,...header.map(l=>textScore(l.text,outfit.name)))})).sort((a,b)=>b.score-a.score);
    return { ...character, nameScore: score, score: Math.max(score, outfits[0]?.score || 0), outfit: outfits[0], outfitMargin: (outfits[0]?.score||0)-(outfits[1]?.score||0) };
  }).sort((a,b)=>b.score-a.score || b.nameScore-a.nameScore);
  const best = candidates[0];
  if (!best || best.score < .79 || best.score-candidates[1]?.score < .07) return { character: null, outfit: null, candidates: candidates.slice(0,3) };
  const outfit = best.outfit?.score >= .78 && best.outfitMargin >= .07 ? best.outfit : null;
  return { character: { id:best.id, name:best.name, score:best.score }, outfit, candidates: candidates.slice(0,3) };
}
export function skillCandidates(text, catalog) {
  if (baseName(text).length < 4) return [];
  return catalog.groups.map(g => ({...g, score: textScore(text,g.name)}))
    .filter(g=>g.score >= .72).sort((a,b)=>b.score-a.score).slice(0,4);
}
function inferredCircle(text) {
  if (/[◎©⊙⦿]/.test(text)) return '◎';
  if (/[○◯〇]/.test(text) || /(?:\s|^)[Oo0]$/.test(text.trim())) return '○';
  if (/[×✕]$/.test(text.trim())) return '×';
  return null;
}
export function resolveSkill(group, text, { primary = false, circle = null } = {}) {
  let entries = group.entries;
  const variant = circle || inferredCircle(text);
  if (variant) {
    const filtered = entries.filter(e=>e.name.includes(variant));
    if (filtered.length) entries = filtered;
  }
  if (entries.some(e=>/^9\d{5}$/.test(e.id)) && entries.some(e=>/^1\d{5}$/.test(e.id))) {
    entries = entries.filter(e=>primary ? /^1\d{5}$/.test(e.id) : /^9\d{5}$/.test(e.id));
  }
  entries = [...new Map(entries.map(e=>[e.id,e])).values()];
  return { selectedId: entries.length === 1 ? entries[0].id : '', alternatives: group.entries,
    name: entries.length === 1 ? entries[0].name : group.name.replace(/[○◎×]/g,'').trim(),
    variantSource: circle ? 'image' : variant ? 'ocr' : null };
}
function center(line) { return (line.bbox.y0 + line.bbox.y1)/2; }
export function matchSkills(lines, catalog, { width, height, outfitId, circleAt } = {}) {
  const anchor = lines.filter(l=>/^(?:inspiration|career info|skills)$/i.test(l.text.trim()));
  const minY = anchor.length ? Math.max(...anchor.map(l=>l.bbox.y1)) : 0;
  const usable = lines.filter(l => !l.bbox || l.bbox.y0 > minY).filter(l=>baseName(l.text).length>=3);
  const observations = usable.map((line,index)=>({text:line.text, lines:[line], indices:[index]}));
  // Join wrapped text in the same column, never text from opposite columns.
  for (let i=0;i<usable.length;i++) {
    const a=usable[i]; if(!a.bbox) continue;
    const next = usable.map((b,j)=>({b,j})).filter(({b,j})=>j!==i && b.bbox && center(b)>center(a) && (width ? (a.bbox.x0<width/2)===(b.bbox.x0<width/2) : true) && Math.abs(b.bbox.x0-a.bbox.x0)<Math.max(35,width*.06) && b.bbox.y0-a.bbox.y1>=-3 && b.bbox.y0-a.bbox.y1<(a.bbox.y1-a.bbox.y0)*.85).sort((x,y)=>center(x.b)-center(y.b))[0];
    if (next) observations.push({text:a.text+' '+next.b.text,lines:[a,next.b],indices:[i,next.j]});
  }
  const ranked = observations.flatMap(observation => {
    const candidates = skillCandidates(observation.text,catalog), best=candidates[0];
    if(!best || best.score < .79) return [];
    const margin = best.score-(candidates[1]?.score||0);
    return [{...observation, group:best, score:best.score, margin, candidates}];
  }).sort((a,b)=>b.score-a.score || b.indices.length-a.indices.length);
  const used=new Set(), found=[];
  for(const observation of ranked) {
    if(observation.indices.some(i=>used.has(i))) continue;
    observation.indices.forEach(i=>used.add(i)); found.push(observation);
  }
  found.sort((a,b)=>a.indices[0]-b.indices[0]);
  const firstY=Math.min(Infinity,...found.flatMap(o=>o.lines.map(l=>l.bbox?.y0??Infinity)));
  const uniqueId = outfitId ? String(100000+(Number(outfitId.slice(0,4))-1000)*10+1+(Number(outfitId.slice(4))-1)*10000) : null;
  const matches=found.map(o=>{
    const level=/\b(?:lvl|lv|lyl)\s*\d+/i.test(o.text);
    const topLeft = o.lines[0].bbox && o.lines[0].bbox.y0 < firstY + height*.025 && o.lines[0].bbox.x0<width/2;
    const primary=level || (topLeft && o.group.entries.some(e=>e.id===uniqueId));
    const evidence=circleAt && o.group.entries.some(e=>/[◎○]/.test(e.name)) ? circleAt(o.lines.at(-1)) : null;
    const circle=typeof evidence==='string'?evidence:evidence?.symbol;
    const resolved=resolveSkill(o.group,o.text,{primary,circle});
    const ambiguous=o.margin<.07;
    return { ...resolved, selectedId:ambiguous?'':resolved.selectedId, observed:o.text, score:o.score,
      review: ambiguous || !resolved.selectedId || o.score < .92,
      alternatives: ambiguous ? o.candidates.flatMap(c=>c.entries) : resolved.alternatives,
      bbox:o.lines[0].bbox, primary, symbolPreview:evidence?.preview };
  });
  const ids=new Set();
  const deduped=matches.filter(m=>{if(!m.selectedId)return true;if(ids.has(m.selectedId))return false;ids.add(m.selectedId);return true;});
  const unmatched=usable.filter((l,i)=>!used.has(i) && baseName(l.text).length>5 && !/^(?:close|lvl?\s*\d+)$/i.test(l.text.trim())).map(l=>l.text);
  return { matches:deduped, unmatched };
}
export function extractStats(lines, width, height) {
  const names=['speed','stamina','power','guts','wisdom'];
  const out=Object.fromEntries(names.map(n=>[n,null]));
  const track=lines.find(l=>/^track$/i.test(l.text.trim()));
  const yMax=track?.bbox?.y0 ?? height*.34;
  const eligible=lines.filter(l=>l.bbox && l.bbox.y0>height*.13 && l.bbox.y1<yMax);
  // Use the row containing five large stat values; tolerate a rank stuck to a number.
  const numeric=eligible.flatMap(l=>{
    const tokens=[...l.text.matchAll(/\b\d{3,4}\b/g)];
    return tokens.map(t=>({value:Number(t[0]),y:center(l),x:l.bbox.x0+(l.bbox.x1-l.bbox.x0)*(t.index+t[0].length/2)/Math.max(1,l.text.length)}));
  });
  const rows=[];
  for(const n of numeric){let row=rows.find(r=>Math.abs(r[0].y-n.y)<height*.018);if(!row){row=[];rows.push(row);}row.push(n);}
  const best=rows.filter(r=>r.length===5).sort((a,b)=>b[0].y-a[0].y)[0];
  if(best) best.sort((a,b)=>a.x-b.x).forEach((n,i)=>out[names[i]]=n.value);
  return out;
}
export function buildGameJSON({ outfitId = '', stats = {}, settings = {}, matches = [] }) {
  const numeric=value=>value === '' || value == null ? null : Number(value);
  return { outfitId: outfitId || null, speed:numeric(stats.speed), stamina:numeric(stats.stamina), power:numeric(stats.power), guts:numeric(stats.guts), wisdom:numeric(stats.wisdom),
    strategy:settings.strategy||null, distanceAptitude:settings.distanceAptitude||null, surfaceAptitude:settings.surfaceAptitude||null, strategyAptitude:settings.strategyAptitude||null,
    mood:numeric(settings.mood), skills:[...new Set(matches.map(m=>m.selectedId).filter(Boolean))], forcedSkillPositions:{} };
}
