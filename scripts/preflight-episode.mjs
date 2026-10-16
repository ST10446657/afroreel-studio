import {existsSync,mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).map((value,index,list)=>value.startsWith('--')?[value.slice(2),list[index+1]]:null).filter(Boolean));
const episode=Number(args.episode);
const driveId=args['drive-id'];
const sourceScript=resolve(args.script??'/Users/jessemamulis/.codex/attachments/bb8f967f-56aa-40d8-bc1d-5ef056f73373/Pasted text.txt');
if(!episode||!driveId)throw Error('Usage: npm run production:preflight -- --episode 6 --drive-id DRIVE_FILE_ID [--script FILE]');

const root=resolve(`.sites-runtime/post-production/series-2/episode-${episode}`);
const preflight=resolve(root,'preflight');
const video=resolve(root,`season-2-episode-${episode}.mp4`);
const scriptFile=resolve(root,`episode-${episode}-script.txt`);
const audio=resolve(preflight,'english-source.wav');
const transcriptPrefix=resolve(preflight,'local-transcript-small');
const report=resolve(preflight,'transcript-review.md');
const model=resolve('.sites-runtime/models/ggml-small.en.bin');
mkdirSync(preflight,{recursive:true});

function run(command,commandArgs,{allowFailure=false}={}){
 const result=spawnSync(command,commandArgs,{stdio:'inherit'});
 if(result.status!==0&&!allowFailure)throw Error(`${command} failed with exit code ${result.status}`);
 return result.status===0;
}

const fullScript=readFileSync(sourceScript,'utf8');
const start=new RegExp(`^EPISODE ${episode}\\s*[—-]`, 'm');
const startMatch=start.exec(fullScript);
if(!startMatch)throw Error(`Episode ${episode} was not found in the supplied script.`);
const remainder=fullScript.slice(startMatch.index);
const next=new RegExp(`^EPISODE ${episode+1}\\s*[—-]`, 'm').exec(remainder);
const episodeScript=(next?remainder.slice(0,next.index):remainder).trim()+'\n';
writeFileSync(scriptFile,episodeScript);

if(!existsSync(video)||statSync(video).size<1_000_000){
 const url=`https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`;
 run('curl',['-L','--fail','--retry','2','--output',video,url]);
}
if(!existsSync(model))throw Error(`Whisper model is missing: ${model}`);

const ffmpeg=existsSync('/Users/jessemamulis/.local/bin/ffmpeg')?'/Users/jessemamulis/.local/bin/ffmpeg':'ffmpeg';
run(ffmpeg,['-y','-i',video,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',audio]);
run('whisper-cli',['-m',model,'-f',audio,'-otxt','-osrt','-oj','-of',transcriptPrefix]);

const transcript=readFileSync(`${transcriptPrefix}.txt`,'utf8').trim();
const wordCount=episodeScript.split(/\s+/).filter(Boolean).length;
writeFileSync(report,`# Series 2, Episode ${episode} — transcript preflight

Status: **AWAITING HUMAN REVIEW**  
Paid ElevenLabs requests: **0**

## Source

- Drive file ID: \`${driveId}\`
- Render: \`${video.split('/').at(-1)}\`
- Script: \`${scriptFile.split('/').at(-1)}\` (${wordCount} words)
- Transcript: \`local-transcript-small.txt\`

## Locally detected dialogue

> ${transcript.replaceAll('\n','\n> ')}

## Approval gate

Compare the detected dialogue with the episode script. Correct material names or meaning errors before approving the paid Zulu pilot. This workflow never starts a paid ElevenLabs request automatically.
`);

writeFileSync(resolve(root,'source-manifest.json'),JSON.stringify({series:2,episode,driveFileId:driveId,video,script:scriptFile,audio,transcript:`${transcriptPrefix}.txt`,report,paidRequests:0,status:'awaiting_human_review'},null,2));
console.log(JSON.stringify({ok:true,episode,video,script:scriptFile,transcript:`${transcriptPrefix}.txt`,report,paidRequests:0},null,2));
