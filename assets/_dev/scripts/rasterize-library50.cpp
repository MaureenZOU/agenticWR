// CPU triangle rasterization with an orthographic camera and a true z-buffer.
// Output: raw RGBA, alpha records actual raster coverage.
// Input: int32 width,height,triangle_count; float32 [triangles,3,6] (x,y,z,r,g,b).
#include <algorithm>
#include <cmath>
#include <fstream>
#include <limits>
#include <vector>
int main(int argc,char** argv) {
  if(argc!=3)return 2;
  std::ifstream in(argv[1],std::ios::binary);
  int w,h,n;in.read((char*)&w,4);in.read((char*)&h,4);in.read((char*)&n,4);
  if(!in||w<=0||h<=0||n<=0)return 3;
  std::vector<float> depth(w*h,std::numeric_limits<float>::infinity());
  std::vector<unsigned char> rgb(w*h*4,0);
  float v[3][6];
  for(int i=0;i<n;i++){
    in.read((char*)v,sizeof(v));if(!in)return 4;
    float den=(v[1][1]-v[2][1])*(v[0][0]-v[2][0])+(v[2][0]-v[1][0])*(v[0][1]-v[2][1]);
    if(std::abs(den)<1e-8)continue;
    int x0=std::max(0,(int)std::floor(std::min({v[0][0],v[1][0],v[2][0]})));
    int x1=std::min(w-1,(int)std::ceil(std::max({v[0][0],v[1][0],v[2][0]})));
    int y0=std::max(0,(int)std::floor(std::min({v[0][1],v[1][1],v[2][1]})));
    int y1=std::min(h-1,(int)std::ceil(std::max({v[0][1],v[1][1],v[2][1]})));
    for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){
      float a=((v[1][1]-v[2][1])*(x+.5f-v[2][0])+(v[2][0]-v[1][0])*(y+.5f-v[2][1]))/den;
      float b=((v[2][1]-v[0][1])*(x+.5f-v[2][0])+(v[0][0]-v[2][0])*(y+.5f-v[2][1]))/den;
      float c=1-a-b;if(a<0||b<0||c<0)continue;
      float z=a*v[0][2]+b*v[1][2]+c*v[2][2];int p=y*w+x;
      if(z>=depth[p])continue;depth[p]=z;
      for(int j=0;j<3;j++)rgb[p*4+j]=(unsigned char)std::clamp(255.f*(a*v[0][3+j]+b*v[1][3+j]+c*v[2][3+j]),0.f,255.f);
      rgb[p*4+3]=255;
    }
  }
  std::ofstream out(argv[2],std::ios::binary);
  out.write((char*)rgb.data(),rgb.size());return out?0:5;
}
