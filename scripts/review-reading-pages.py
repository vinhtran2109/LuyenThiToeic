from PIL import Image,ImageDraw
from pathlib import Path
root=Path('uploads/import-e2ac1f15-5d96-42d7-945d-301b4a9c6f97')
pages=[(239,.05,.85),(253,.05,.85),(257,.05,.85)]
for batch in range(1):
 sheet=Image.new('RGB',(1800,850),'#eee');draw=ImageDraw.Draw(sheet)
 for i,(n,y0,y1) in enumerate(pages[batch*3:batch*3+3]):
  img=Image.open(root/f'page-{n:03}.jpg');crop=img.crop((.06*img.width,y0*img.height,.95*img.width,y1*img.height));crop.thumbnail((590,810));sheet.paste(crop,(i*600,30));draw.text((i*600+10,5),f'PDF PAGE {n}',fill='black')
 sheet.save(f'artifacts/reading-import/verify-test9-{batch+1}.jpg')
