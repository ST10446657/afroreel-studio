#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import process from 'node:process';

const args=new Map();for(let i=2;i<process.argv.length;i++){const part=process.argv[i];if(!part.startsWith('--'))continue;const key=part.slice(2);const next=process.argv[i+1];if(!next||next.startsWith('--'))args.set(key,true);else{args.set(key,next);i++}}
const required=name=>{const value=args.get(name);if(typeof value!=='string'||!value.trim())throw Error(`Missing --${name}`);return value.trim()};
const episode=Number(required('episode'));if(!Number.isInteger(episode)||episode<1)throw Error('--episode must be a positive whole number.');
const language=required('language');if(!['en','zu'].includes(language))throw Error('--language must be en or zu.');
const at=required('at');const scheduledAt=/[zZ]|[+-]\d\d:\d\d$/.test(at)?at:`${at}:00+02:00`;
if(!Number.isFinite(new Date(scheduledAt).getTime()))throw Error('--at must be an ISO date/time, for example 2026-10-01T20:30.');
const platformNames={facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube'};
const platforms=required('platforms').split(',').map(x=>platformNames[x.trim().toLowerCase()]).filter(Boolean);
if(!platforms.length)throw Error('--platforms must include facebook, instagram, tiktok or youtube.');
const videoUrl=args.get('video-url')||(`https://drive.google.com/uc?export=download&id=${required('drive-file-id')}`);
const captionFile=String(args.get('captions')||'content/episode-captions.md');
const source=await readFile(new URL(`../${captionFile}`,import.meta.url),'utf8');
const match=source.match(new RegExp(`^### \\*\\*EPISODE ${episode}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n---|\\n### |$)`,'mi'));
if(!match)throw Error(`Episode ${episode} was not found in ${captionFile}.`);
const caption=match[1].replaceAll('\\#','#').replaceAll('\\!','!').replace(/\*\*/g,'').trim();
const title=String(args.get('title')||`She Grew Up a Servant in Her Own Home · Episode ${episode}`);
const payload={language,episode,title,caption,videoUrl:String(videoUrl),scheduledAt,platforms};
console.log(JSON.stringify({...payload,caption:`${caption.slice(0,100)}${caption.length>100?'…':''}`},null,2));
if(!args.get('confirm')){console.log('\nDry run only. Add --confirm to create this schedule.');process.exit(0)}
const mediaCheck=await fetch(String(videoUrl),{method:'HEAD',redirect:'follow'});
const mediaType=mediaCheck.headers.get('content-type')??'';
if(!mediaCheck.ok||mediaType.includes('text/html'))throw Error('The video URL is not publicly downloadable. In Drive, set this file to Anyone with the link before scheduling.');
const endpoint=process.env.AFROREEL_STUDIO_URL||'https://afroreel-studio.mamulis101.chatgpt.site';
const key=process.env.STUDIO_AUTOMATION_KEY;if(!key)throw Error('STUDIO_AUTOMATION_KEY is missing from the environment.');
const bypass=process.env.SITES_BYPASS_TOKEN;if(!bypass)throw Error('SITES_BYPASS_TOKEN is missing from the environment.');
const response=await fetch(`${endpoint}/api/automation/schedule`,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'OAI-Sites-Authorization':`Bearer ${bypass}`},body:JSON.stringify(payload)});
const result=await response.json();if(!response.ok)throw Error(result.error||`Schedule request failed (${response.status}).`);
console.log(`\n${result.message}`);console.log(`ID: ${result.id}`);console.log(`Status: ${result.status}`);
