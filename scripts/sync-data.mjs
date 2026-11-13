import {cp,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('public/data/',root),{recursive:true});
for(const name of ['skillnames.json','umas.json']) await cp(new URL(name,root),new URL('public/data/'+name,root));
