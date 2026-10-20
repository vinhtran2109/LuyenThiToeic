import json,re
from pathlib import Path
from PIL import Image,ImageDraw
root=Path('uploads/import-e2ac1f15-5d96-42d7-945d-301b4a9c6f97')
locations={1:{117:3},2:{111:32,125:33,134:34},3:{101:60,111:61,133:63,134:63,137:64,138:64,142:65,180:79},4:{128:91,129:91,134:92},5:{111:119,137:122,138:122,139:123},6:{121:149,126:149,127:149,131:150,138:151}}
def dist(a,b):
 p=list(range(len(b)+1))
 for i,x in enumerate(a):
  q=[i+1]
  for j,y in enumerate(b):q.append(min(q[-1]+1,p[j+1]+1,p[j]+(x!=y)))
  p=q
 return p[-1]
items=[]
for test,qs in locations.items():
 for q,p in qs.items():
  data=json.loads((root/f'page-{p:03}.json').read_text(encoding='utf-8'));img=Image.open(root/f'page-{p:03}.jpg')
  words=[w for w in data['words'] if re.search(r'\d',w['text']) and len(w['text'])<=6 and w['y']/data['height']<.9 and (w['x']/data['width']<.17 or .48<w['x']/data['width']<.61)]
  def score(w):
   text=w['text'].strip('.,:)');return dist(str(q),text)+(3 if re.fullmatch(r'1\d\d',text) and int(text)!=q else 0)
  words.sort(key=score);w=words[0];box=(max(0,w['x']-10),max(0,w['y']-10),min(img.width,w['x']+520),min(img.height,w['y']+140));crop=img.crop(box);crop.thumbnail((390,110));items.append((test,q,p,w['text'],crop))
for batch in range((len(items)+17)//18):
 rows=items[batch*18:batch*18+18];sheet=Image.new('RGB',(1200,150*((len(rows)+2)//3)),'#eee');draw=ImageDraw.Draw(sheet)
 for i,(test,q,p,raw,crop) in enumerate(rows):x=i%3*400;y=i//3*150;draw.text((x+5,y+5),f'TEST {test} / Q{q} / PDF {p} / OCR {raw}',fill='black');sheet.paste(crop,(x+5,y+30))
 sheet.save(f'artifacts/reading-import/review-{batch+1}.jpg')
Path('artifacts/reading-import/reviewed-locations.json').write_text(json.dumps(locations,indent=2))
