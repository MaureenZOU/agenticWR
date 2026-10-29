"""Curate 30 rigid, 7 skinned and 13 soft examples; use paper source images as icons."""
from pathlib import Path
import json
from PIL import Image,ImageOps
SITE=Path(__file__).resolve().parents[1];paper=SITE.parent/'paper/figures/assets.png';source=Image.open(paper).convert('RGB');sx=source.width/2048;sy=source.height/823
old=json.loads((SITE/'assets/demos/catalog.json').read_text());objects={x['id']:x for x in json.loads((SITE/'assets/lab/objects.json').read_text())}
rigid=[('ikea','Writing desk',(1,6)),('partnet_refrigerator_10036','Refrigerator',(5,8)),('spot_with_arm','Spot',(0,2)),('anymal_c','ANYmal',(0,3)),('aloha','ALOHA',(0,4)),('franka_panda','Panda',(0,5)),('kinova_gen3','Kinova',(0,6)),('shadow_dexee','Dexee',(0,7)),('allegro_hand_v3','Allegro',(0,8)),('xhand_right','XHand',(0,9)),('book','Book',(1,0)),('cabinet','Cabinet',(1,1)),('cardboardbox','Box',(1,2)),('clamp','Clamp',(1,3)),('foldingrule','Folding rule',(1,4)),('globe','Globe',(1,5)),('laptop','Laptop',(1,8)),('microwave','Microwave',(1,9)),('pliers','Pliers',(2,0)),('rubikscube','Rubik’s cube',(2,1)),('treasurebox','Treasure box',(2,2)),('tripod','Tripod',(2,3)),('partnet_dishwasher_11622','Dishwasher',(2,4)),('partnet_door_8997','Door',(3,9)),('partnet_faucet_1370','Faucet',(4,9)),('partnet_lamp_16208','Lamp',(5,0)),('partnet_oven_7187','Oven',(5,5)),('partnet_switch_100935','Switch',(8,0)),('partnet_toilet_102676','Toilet',(8,8)),('partnet_window_103051','Window',(9,9))]
softall=['001-rope','008-pink-cloth','009-yellow-cloth','010-orange-cloth','011-green-cloth','023-cleaning-cloth','024-glass-cleaner-cloth','043-dog','044-doll','045-cat','049-ball','050-boxing','051-cube','056-makeup-sponge','057-kitchen-sponge','081-stripe-rope','092-squirrel','095-watermelon','096-octopus','097-pillow','100-puppet','120-bread-plush','121-croissant-plush','125-rabbit','128-stress-cube','163-bear','164-sheep','168-cat-big','171-penguin','188-foam-roll-small']
soft=[x for x in old if x['family']=='deformable' and x['id'] not in ['049-ball','097-pillow','188-foam-roll-small']]+[dict(id=i,name=n,family='deformable') for i,n in [('049-ball','Soft ball'),('097-pillow','Pillow'),('188-foam-roll-small','Foam roll')]]
skin=[x for x in old if x['family']=='skinned'];skinc={'smal_felidae':0,'smal_canidae':1,'smal_equidae':2,'smal_bovidae':3,'smal_hippopotamidae':4,'smpl_female':5,'smpl_male':6}
entries=[dict(id=i,name=n,family='articulated',cell=cell) for i,n,cell in rigid]+skin+soft
sources=[];demos=[];catalog=[]
for item in entries:
 ident=item['id'];family=item['family'];existing=next((x for x in old if x['id']==ident),None)
 if family=='articulated':r,c=item['cell'];x=340+c*98.1;y=43+r*77.5;w=96;h=75
 elif family=='skinned':r=0;c=skinc[ident];x=1355+c*98.1;y=44;w=96;h=74
 else:r,c=divmod(softall.index(ident),3);x=8+c*98.5;y=43+r*77.5;w=96;h=75
 box=tuple(round(v) for v in (x*sx,y*sy,(x+w)*sx,(y+h)*sy));crop=source.crop(box);crop=ImageOps.contain(crop,(256,200),Image.Resampling.LANCZOS);thumb=Image.new('RGB',(256,200),'white');thumb.paste(crop,((256-crop.width)//2,(200-crop.height)//2));thumb.save(SITE/f'assets/zoo-thumbnails/{ident}.png',optimize=True)
 sources.append({'id':ident,'source':'paper/figures/assets.png','panel':family,'row':r,'column':c,'crop_pixels':box,'image_kind':'original source photograph or native material render; not a field reconstruction'})
 demo={k:v for k,v in (existing or {}).items()};demo.update(id=ident,name=item['name'],family=family,animated=True)
 if not existing:demo.update(src=f'assets/demos/library50/{ident}.gif',poster=f'assets/demos/library50/{ident}.png')
 demos.append(demo);entry=dict(objects.get(ident,{}));entry.update(id=ident,name=item['name'],family=family,thumbnail=f'assets/zoo-thumbnails/{ident}.png');catalog.append(entry)
assert len(catalog)==50 and len({x['id'] for x in catalog})==50
(SITE/'assets/lab/objects.json').write_text(json.dumps(catalog,indent=2)+'\n');(SITE/'assets/demos/catalog.json').write_text(json.dumps(demos,indent=2)+'\n');(SITE/'assets/zoo-thumbnails/sources.json').write_text(json.dumps({'source_figure':'paper/figures/assets.png','reference':'paper/sections/appendix.tex','counts':{'articulated':30,'skinned':7,'deformable':13},'objects':sources},indent=2)+'\n')
print('Catalog:',len(catalog))
