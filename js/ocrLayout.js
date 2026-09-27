// Reconstruct horizontal reading order using actual detected polygons.
// Never infer a missing VAL label from the latest date or the expected answer.
export function textRows(items) {
  const blocks = items.filter(i => i.poly?.length && i.text?.trim()).map(item => {
    const xs=item.poly.map(p=>p[0]), ys=item.poly.map(p=>p[1]);
    const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
    return {...item,x,y,w,h,cy:y+h/2};
  }).sort((a,b)=>a.cy-b.cy);
  const rows=[];
  for(const block of blocks) {
    const row=rows.find(r=>Math.abs(r.cy-block.cy)<=.45*Math.min(r.h,block.h));
    if(row) row.blocks.push(block);
    else rows.push({cy:block.cy,h:block.h,blocks:[block]});
  }
  return rows.map(row=>{
    row.blocks.sort((a,b)=>a.x-b.x);
    const x=Math.min(...row.blocks.map(b=>b.x)),y=Math.min(...row.blocks.map(b=>b.y));
    return {text:row.blocks.map(b=>b.text).join(' '),score:Math.min(...row.blocks.map(b=>b.score)),
      x,y,w:Math.max(...row.blocks.map(b=>b.x+b.w))-x,h:Math.max(...row.blocks.map(b=>b.y+b.h))-y};
  });
}
