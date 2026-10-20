import {PrismaClient} from '@prisma/client';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const d=new PrismaClient(),file='artifacts/audio-tests/browser-fixture.json';
if(process.argv[2]==='cleanup'){
 const x=JSON.parse(await fs.readFile(file,'utf8'));
 await d.attempt.deleteMany({where:{testId:x.testId}});await d.audioMapping.deleteMany({where:{testId:x.testId}});await d.question.deleteMany({where:{testId:x.testId}});await d.test.delete({where:{id:x.testId}});await d.document.delete({where:{id:x.documentId}});
}else{
 const id='audio-browser-qa-'+randomUUID(),docId=randomUUID();
 const source=await d.test.findUniqueOrThrow({where:{id:'sample-3'},include:{questions:true}});
 await fs.copyFile('artifacts/audio-tests/spoken-sample.wav','uploads/'+id+'.wav');
 await d.document.create({data:{id:docId,name:'QA spoken audio',path:'/uploads/'+id+'.wav',kind:'audio',mime:'audio/wav',size:0,status:'ready'}});
 await d.test.create({data:{id,title:'QA continuous audio playback',year:0,collection:'QA',description:'Temporary browser QA',published:true,questions:{create:source.questions.map(({id:testQuestionId,testId,...q})=>({...q,id:id+'-'+q.number}))}}});
 const groups=[...Array.from({length:6},(_,i)=>[1,i+1,i+1]),...Array.from({length:25},(_,i)=>[2,i+7,i+7]),...Array.from({length:13},(_,i)=>[3,32+i*3,34+i*3]),...Array.from({length:10},(_,i)=>[4,71+i*3,73+i*3])];
 await d.audioMapping.createMany({data:groups.map(([part,questionStart,questionEnd],i)=>({id:randomUUID(),testId:id,documentId:docId,part,questionStart,questionEnd,groupId:source.questions.find(q=>q.number===questionStart).groupId,sequence:i+1,start:i*.1,end:(i+1)*.1,playbackStart:i*.1,playbackEnd:i===53?13.5:(i+1)*.1,confirmed:true,continuous:true,gap:0}))});
 const r=await fetch('http://127.0.0.1:3001/api/attempts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({testId:id,mode:'exam',section:'all'})});const a=await r.json();if(!r.ok)throw Error(JSON.stringify(a));
 const x={testId:id,documentId:docId,attemptId:a.id};await fs.writeFile(file,JSON.stringify(x));console.log(x);
}
await d.$disconnect();
