import {test} from 'node:test';
import assert from 'node:assert/strict';
import {textRows} from '../js/ocrLayout.js';
import {findExpiry} from '../js/dates.js';
const block=(text,x,y,w=60,h=20)=>({text,score:.95,poly:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]});
test('spatial order reunites separated month and year, without crossing manufacture rows',()=>{
 const items=[block('28',100,40),block('26',100,0),block('V04',0,42),block('F04',0,0)];
 const text=textRows(items).map(r=>r.text).join('\n');
 assert.equal(text,'F04 26\nV04 28');
 assert.equal(findExpiry(text,'2026-09-27')?.iso,'2028-04-30');
 assert.equal(findExpiry(textRows([block('F04',0,0),block('26',100,0)]).map(r=>r.text).join('\n'),'2026-09-27'),null);
});
test('different-height lines are not joined into an invented month/year',()=>{
 const text=textRows([block('V04',0,0),block('28',100,50)]).map(r=>r.text).join('\n');
 assert.equal(findExpiry(text,'2026-09-27'),null);
});
