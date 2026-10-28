// Linear-time stable depth bucket sort. Distinct splats are quantized only for
// draw order, never for geometry, appearance, or inference input.
export function sortGaussians(means,view) {
  const count=means.length/3, depths=new Float32Array(count), bins=65536;
  const histogram=new Uint32Array(bins), offsets=new Uint32Array(bins), order=new Float32Array(count);
  let min=Infinity,max=-Infinity;
  for(let i=0;i<count;i++) {
    const p=i*3,z=view[2]*means[p]+view[6]*means[p+1]+view[10]*means[p+2]+view[14];
    depths[i]=z;if(z<min)min=z;if(z>max)max=z;
  }
  const factor=max>min ? (bins-1)/(max-min) : 0;
  const bin=(z)=>Math.max(0,Math.min(bins-1,Math.floor((z-min)*factor)));
  for(let i=0;i<count;i++)histogram[bin(depths[i])]++;
  for(let i=1;i<bins;i++)offsets[i]=offsets[i-1]+histogram[i-1];
  // OpenGL camera looks along -Z: more negative centers are rendered first.
  for(let i=0;i<count;i++)order[offsets[bin(depths[i])]++]=i;
  return order;
}
