import fs from 'node:fs/promises';
const base='http://127.0.0.1:3001/api/audio';
const projects=await(await fetch(base+'/projects')).json();let p=projects.find(p=>p.title==='TEST 01.mp3');
if(!p){const form=new FormData();form.append('file',new Blob([await fs.readFile('D:/Downloads/TEST 01.mp3')]),'TEST 01.mp3');const r=await fetch(base+'/upload',{method:'POST',body:form});p=await r.json();if(!r.ok)throw Error(JSON.stringify(p));}
await fs.writeFile('artifacts/test01-listening/project.json',JSON.stringify({id:p.id}));console.log('Project',p.id);
for(let i=0;i<180;i++){const q=await(await fetch(base+'/projects/'+p.id)).json();let j=q.jobs.find(j=>j.kind==='analyze');if(j.status==='error')throw Error(j.message);if(j.status==='completed'){console.log('Analyzed',q.duration,q.metadata);break;}await new Promise(r=>setTimeout(r,500));}
const r=await fetch(base+'/projects/'+p.id+'/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});console.log('Detect',r.status,await r.json());
