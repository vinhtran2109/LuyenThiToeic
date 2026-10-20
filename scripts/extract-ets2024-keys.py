import pymupdf as fitz
import json,re,hashlib
from pathlib import Path
root=Path('artifacts/answer-keys');root.mkdir(parents=True,exist_ok=True)
output={}
for section in ['RC','LC']:
 source=next(Path('D:/Downloads').glob('*2024 '+section+'.pdf'))
 doc=fitz.open(source);tests={}
 for page_no,page in enumerate(doc):
  if page_no==0:continue
  for row in range(2):
   for col in range(2):
    w,h=page.rect.width,page.rect.height
    rect=fitz.Rect(col*w/2,row*h/2,(col+1)*w/2,(row+1)*h/2)
    text=page.get_text(clip=rect)
    pairs=re.findall(r'(?<!\d)(\d{1,3})\s*\(([ABCD])\)',text)
    if not pairs:continue
    labels=re.findall(r'TEST\s*(\d+)',text)
    assert len(labels)==1,(section,page_no,row,col,labels)
    test=int(labels[0]);assert test not in tests
    expected=list(range(101,201) if section=='RC' else range(1,101))
    assert len(pairs)==100 and sorted(int(n) for n,a in pairs)==expected
    answers={n:a for n,a in pairs}
    assert section!='LC' or all(answers[str(i)]!='D' for i in range(7,32))
    tests[test]={'page':page_no+1,'region':[row,col],'answers':answers}
 assert sorted(tests)==list(range(1,11))
 output[section]={'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'tests':tests}
(root/'extracted.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print('Validated 10 RC + 10 LC sets: 100 unique answers each, spatial TEST headers, Part 2 A-C.')
