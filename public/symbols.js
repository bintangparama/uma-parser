// Count enclosed white regions inside a circular brown glyph. A double circle
// has two enclosed regions; a single circle has one. Return null when uncertain.
export function classifyCircle(pixels, width, height, expectedHeight, relaxed = false) {
  const mask=new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++) {
    const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2];
    mask[i]=(relaxed ? r>g*1.08 && g>b*1.02 && r-b>20 && r<230 && g<205 : r>g*1.12 && g>b*1.05 && r-b>30 && r<210 && g<175) ? 1:0;
  }
  const visited=new Uint8Array(mask.length), components=[];
  const neighbors=i=>{const x=i%width,y=Math.floor(i/width);return [x?i-1:-1,x+1<width?i+1:-1,y?i-width:-1,y+1<height?i+width:-1].filter(v=>v>=0);};
  for(let i=0;i<mask.length;i++) if(mask[i]&&!visited[i]) {
    const queue=[i];visited[i]=1;let x0=width,y0=height,x1=0,y1=0;
    for(let j=0;j<queue.length;j++) {const p=queue[j],x=p%width,y=Math.floor(p/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const n of neighbors(p))if(mask[n]&&!visited[n]){visited[n]=1;queue.push(n);}}
    const w=x1-x0+1,h=y1-y0+1;
    if(h>expectedHeight*.48 && h<expectedHeight*1.6 && w/h>.68 && w/h<1.38 && x0>1 && y0>0 && x1<width-1 && y1<height-1) components.push({x0,x1,y0,y1,w,h});
  }
  for(const c of components.sort((a,b)=>b.x1-a.x1 || b.w-a.w)) {
    // Compression can open a one-pixel gap in the outer ring. Two concentric,
    // disconnected brown contours still identify a double circle.
    const nested=components.some(inner=>inner!==c && inner.x0>c.x0 && inner.x1<c.x1 && inner.y0>c.y0 && inner.y1<c.y1 && inner.w/c.w>.4 && inner.w/c.w<.85 && Math.abs((inner.x0+inner.x1-c.x0-c.x1)/2)<c.w*.12 && Math.abs((inner.y0+inner.y1-c.y0-c.y1)/2)<c.h*.12);
    if(nested)return '◎';
    const seen=new Uint8Array(mask.length);let holes=0;
    for(let y=c.y0;y<=c.y1;y++) for(let x=c.x0;x<=c.x1;x++) {
      const i=y*width+x;if(mask[i]||seen[i])continue;
      const queue=[i];seen[i]=1;let edge=false;
      for(let j=0;j<queue.length;j++) {const p=queue[j],px=p%width,py=Math.floor(p/width);if(px===c.x0||px===c.x1||py===c.y0||py===c.y1)edge=true;for(const n of neighbors(p)){const nx=n%width,ny=Math.floor(n/width);if(nx>=c.x0&&nx<=c.x1&&ny>=c.y0&&ny<=c.y1&&!mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
      if(!edge && queue.length>=Math.max(2,expectedHeight*expectedHeight*.008))holes++;
    }
    if(holes===2)return '◎';
    if(holes===1)return '○';
  }
  return relaxed ? null : classifyCircle(pixels,width,height,expectedHeight,true);
}
export function imageCircleReader(bitmap) {
  return line=>{
    if(!line.bbox)return null;
    const b=line.bbox,h=b.y1-b.y0;
    const left=Math.max(0,Math.floor(b.x1-h*1.6)),top=Math.max(0,Math.floor(b.y0-h*.25));
    const width=Math.min(bitmap.width-left,Math.ceil(h*3.1)),height=Math.min(bitmap.height-top,Math.ceil(h*1.5));
    if(width<2||height<2)return null;
    const canvas=document.createElement('canvas');canvas.width=width*3;canvas.height=height*3;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,left,top,width,height,0,0,canvas.width,canvas.height);
    const symbol=classifyCircle(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,h*3);
    return { symbol, preview:canvas.toDataURL(), bbox:line.bbox }; 
  };
}
