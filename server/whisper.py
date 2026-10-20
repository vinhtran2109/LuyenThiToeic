"""Optional local STT. Outputs JSONL progress; never uploads source audio."""
import argparse,json,sys,os
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--input');parser.add_argument('--output');parser.add_argument('--model',default='tiny.en');parser.add_argument('--duration',type=float,default=1);args=parser.parse_args()
try:
 import faster_whisper
except ImportError:
 print(json.dumps({'available':False,'error':'Chưa cài faster-whisper cho Python này.'}));sys.exit(0 if args.check else 2)
if args.check:
 print(json.dumps({'available':True,'engine':'faster-whisper','device':'cpu','computeType':'int8'}));sys.exit(0)
try:
 from faster_whisper import WhisperModel
 print(json.dumps({'progress':1,'message':'Loading local Whisper model (first use may download model).'}),flush=True)
 model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=max(1,min(4,os.cpu_count() or 2)),download_root='uploads/.whisper-models')
 segments,info=model.transcribe(args.input,language='en',beam_size=3,word_timestamps=True,vad_filter=True)
 result=[]
 for s in segments:
  result.append({'start':s.start,'end':s.end,'text':s.text.strip(),'words':[{'start':w.start,'end':w.end,'word':w.word} for w in (s.words or [])]})
  print(json.dumps({'progress':min(99,round(s.end/max(args.duration,1)*100)),'message':f'Transcribed {round(s.end,1)} seconds.'}),flush=True)
 with open(args.output,'w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False)
 print(json.dumps({'progress':100,'message':'Transcript complete.'}),flush=True)
except Exception as e:
 print(json.dumps({'error':str(e)}),flush=True);sys.exit(1)
