import {readFile,rename,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';

const root=new URL('../dist/server/',import.meta.url);
await build({entryPoints:[new URL('../lib/dispatch.ts',import.meta.url).pathname],outfile:new URL('scheduler.js',root).pathname,bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers'],minify:true});
await rename(new URL('index.js',root),new URL('vinext-index.js',root));
await writeFile(new URL('index.js',root),`import app from './vinext-index.js';
import {dispatchDue} from './scheduler.js';
export default {
 fetch(request,env,ctx){return app.fetch(request,env,ctx)},
 async scheduled(){
  await dispatchDue();
 }
};
`);
const configUrl=new URL('wrangler.json',root);
const config=JSON.parse(await readFile(configUrl,'utf8'));
config.main='index.js';
config.triggers={crons:['* * * * *']};
await writeFile(configUrl,JSON.stringify(config));
