import {createWorker} from 'tesseract.js';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/reading-import/ocr-cache',{recursive:true});
const worker=await createWorker('eng',1,{cachePath:'artifacts/reading-import/ocr-cache'});
await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'3'});
for(const n of [2,3,29,31]){const result=await worker.recognize(`artifacts/reading-import/page-${n}.png`,{}, {text:true,tsv:true,blocks:true});await fs.writeFile(`artifacts/reading-import/probe-${n}.json`,JSON.stringify(result.data));console.log(`PAGE ${n} confidence ${result.data.confidence}\n${result.data.text.slice(0,1700)}`);}
await worker.terminate();
