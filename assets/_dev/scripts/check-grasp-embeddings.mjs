import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {decodeEmbeddingTrace, embeddingFrame, embeddingRanges, projectNativeHand} from '../../embedding-data.js';

const base=new URL('../../lab/embedding/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('trace.json',base),'utf8'));
const bytes=gunzipSync(await readFile(new URL(manifest.binary,base)));
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const data=decodeEmbeddingTrace(manifest,buffer);
assert.equal(manifest.frames,136);
assert.equal(data.arrays.embedding.length,136*18*128);
assert.equal(manifest.edges.length,17);
assert.equal(manifest.rows[0].step,0);
assert.equal(manifest.rows.at(-1).step,135);
assert(manifest.rows.at(-1).loss<manifest.rows[0].loss);
assert(embeddingFrame(data,'delta',0).every(v=>v===0));
for(let frame=0;frame<manifest.frames;frame++) {
  assert.equal(manifest.rows[frame].step,frame);
  assert.deepEqual(data.arrays.object_embedding.subarray(frame*128,(frame+1)*128),data.arrays.object_embedding.subarray(0,128));
}
const projection=projectNativeHand(data);
assert.equal(projection.length,136*18);
assert(projection.every(p=>p.every(Number.isFinite)&&p[0]>=0&&p[0]<=140&&p[1]>=0&&p[1]<=164));
assert.notDeepEqual(projection.slice(18,36),projection.slice(-18));
const ranges=embeddingRanges(data);
assert(Object.values(ranges).every(r=>r.limit>0&&r.rowMax>0));
assert.equal(manifest.validation.maximum_instrumented_loss_error,0);
assert.equal(manifest.validation.maximum_instrumented_q_gradient_error,0);
assert.equal(manifest.validation.unchanged_model_tensors,true);
assert.throws(()=>decodeEmbeddingTrace(manifest,buffer.slice(0,-4)));
assert.throws(()=>embeddingFrame(data,'delta',-1));
assert.throws(()=>embeddingFrame(data,'invented',0));
console.log(`PASS: ${manifest.frames} accepted native poses; 18 x 128 actual features per step; fixed duck embedding; finite projected FK; recording-wide scales; malformed data rejected`);
