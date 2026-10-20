import fitz
from PIL import Image, ImageDraw
from pathlib import Path
root=Path('artifacts/reading-import');root.mkdir(parents=True,exist_ok=True)
doc=fitz.open(r'D:\Downloads\1000 READING (1).pdf')
pages=[1,2,3,27,28,29,30,31,56,57,58,59,60,86,87,88,260,261,262,290]
sheet=Image.new('RGB',(5*260,4*390),'#ddd')
for i,n in enumerate(pages):
 p=doc[n-1]; pix=p.get_pixmap(matrix=fitz.Matrix(0.55,0.55));img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);img.thumbnail((250,355));x=(i%5)*260;y=(i//5)*390;sheet.paste(img,(x,y+25));ImageDraw.Draw(sheet).text((x+10,y+5),f'PDF PAGE {n}',fill='black')
sheet.save(root/'contact-sheet.jpg')
for n in [1,2,29,30,31]:doc[n-1].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(root/f'page-{n}.png')
print({'pages':len(doc),'pageSize':str(doc[0].rect)})
