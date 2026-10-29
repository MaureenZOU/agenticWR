// Recorded model tensors. Display transforms never modify these arrays.
export function decodeEmbeddingTrace(manifest, buffer) {
  if (manifest.schema !== 'awr-grasp-kp-embedding-v1' || manifest.dtype !== 'float32-le' || buffer.byteLength % 4) throw Error('Unsupported embedding record');
  const values = new Float32Array(buffer), arrays = {};
  let count = 0;
  for (const [name, spec] of Object.entries(manifest.arrays)) {
    if (spec.offset !== count || spec.shape.reduce((a,b)=>a*b,1) !== spec.count || spec.offset+spec.count > values.length) throw Error('Incomplete embedding tensor');
    arrays[name] = values.subarray(spec.offset, spec.offset+spec.count);
    count += spec.count;
  }
  if (count !== values.length || manifest.frames !== manifest.rows.length || manifest.keypoint_names.length !== 18 || manifest.arrays.embedding.shape.join(',') !== `${manifest.frames},18,128`) throw Error('Embedding dimensions do not match');
  if (values.some(value=>!Number.isFinite(value))) throw Error('Nonfinite embedding record');
  return {manifest, arrays};
}

export function embeddingFrame(data, mode, frame) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= data.manifest.frames) throw Error('Invalid embedding frame');
  if (!['embedding','delta','gradient'].includes(mode)) throw Error('Invalid embedding view');
  const stride = 18*128, start = frame*stride;
  if (mode === 'embedding') return data.arrays.embedding.subarray(start,start+stride);
  if (mode === 'gradient') return data.arrays.embedding_gradient.subarray(start,start+stride);
  const result = new Float32Array(stride);
  if (frame) for (let i=0;i<stride;i++) result[i]=data.arrays.embedding[start+i]-data.arrays.embedding[start-stride+i];
  return result;
}

export function embeddingRanges(data) {
  const result = {};
  for (const mode of ['embedding','delta','gradient']) {
    const nonzero = [];
    let rowMax = 0;
    for (let frame=0;frame<data.manifest.frames;frame++) {
      const values=embeddingFrame(data,mode,frame);
      for (let row=0;row<18;row++) {
        let sum=0;
        for (let column=0;column<128;column++) {const v=values[row*128+column];sum+=v*v;if(v) nonzero.push(Math.abs(v));}
        rowMax=Math.max(rowMax,Math.sqrt(sum/128));
      }
    }
    nonzero.sort((a,b)=>a-b);
    // One symmetric range for the entire recording, with 1% tail saturation.
    // Hover always reports the unmodified value, including saturated cells.
    result[mode]={limit:nonzero[Math.floor((nonzero.length-1)*.99)]||1,rowMax:rowMax||1};
  }
  return result;
}

export function networkGradientColors(data) {
  return ['embedding_gradient','object_embedding_gradient'].map(name=>{
    const source=data.arrays[name], stride=source.length/data.manifest.frames;
    const bins=[], magnitudes=[];
    for(let frame=0;frame<data.manifest.frames;frame++) {
      const values=source.subarray(frame*stride,(frame+1)*stride), row=[];
      for(let bin=0;bin<9;bin++) {
        const lo=Math.floor(bin*128/9), hi=Math.floor((bin+1)*128/9);
        let sum=0;
        for(let kp=0;kp<stride/128;kp++) for(let channel=lo;channel<hi;channel++) sum+=Math.abs(values[kp*128+channel]);
        row.push(sum/((stride/128)*(hi-lo)));
      }
      bins.push(row);
      magnitudes.push(Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/stride));
    }
    const sorted=bins.flat().filter(v=>v>0).sort((a,b)=>a-b);
    return {bins,magnitudes,limit:sorted[Math.floor((sorted.length-1)*.99)]||1,magnitudeMax:Math.max(...magnitudes)||1};
  });
}

export function projectNativeHand(data) {
  const points=data.arrays.keypoints;
  const p=i=>Array.from(points.subarray(i*3,i*3+3));
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const unit=a=>a.map(v=>v/Math.hypot(...a));
  // Fixed palm basis from native open FK; the same camera fits every step.
  const origin=p(0), up=unit(sub(p(11),origin));
  const lateral=sub(p(8),p(1));
  const right=unit(sub(lateral,up.map(v=>v*dot(lateral,up))));
  const projected=[];
  for(let i=0;i<points.length;i+=3) {const v=sub(Array.from(points.subarray(i,i+3)),origin);projected.push([dot(v,right),-dot(v,up)]);}
  const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
  for(const v of projected) for(let d=0;d<2;d++){lo[d]=Math.min(lo[d],v[d]);hi[d]=Math.max(hi[d],v[d]);}
  const scale=Math.min(122/(hi[0]-lo[0]),148/(hi[1]-lo[1]));
  return projected.map(v=>[70+(v[0]-(hi[0]+lo[0])/2)*scale,82+(v[1]-(hi[1]+lo[1])/2)*scale]);
}
