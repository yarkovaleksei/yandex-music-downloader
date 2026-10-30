import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// REQ-058: воспроизводимое визуальное окружение без credentials, сети provider и записи audio.
const root = path.resolve(import.meta.dirname, '../../..');
const scratch = path.join(
  root,
  '.harness/local/tmp/exec-72850053dcbf4427b77bce160c66d726/visual059',
);
await mkdir(scratch, { recursive: true });
const oldInput = await readFile(
  path.join(root, 'apps/desktop/evidence/STEP-056/visual-fixture.txt'),
  'utf8',
);
const artwork = oldInput.match(/base64:'([^']+)'/)?.[1];
if (!artwork) throw new Error('Не найдена синтетическая обложка STEP-056');
const fixture = `
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '${root}/apps/desktop/src/renderer/App.tsx';
const query = new URLSearchParams(location.search);
const scenario = query.get('scenario') ?? 'normal';
const ok = (data) => ({ schemaVersion: 1, kind: 'result', command: 'synthetic', data });
const art = { mimeType: 'image/png', base64: '${artwork}' };
const defaults = { outputDirectory:'/Музыка/Yandex Music', quality:'best', concurrency:4, naming:'collection', overwrite:false, ffmpegPath:null, logging:'info', writeTags:true, saveCoverFile:true, writeM3u8:true, theme:query.get('theme') === 'dark' ? 'dark' : 'light' };
let settings = query.has('theme') ? defaults : JSON.parse(localStorage.getItem('step059-settings') ?? 'null') ?? defaults;
let signedIn = scenario !== 'loggedout';
const source = { provider:'synthetic', kind:'playlist', id:'synthetic-collection' };
const statuses = ['running', 'queued', 'paused', 'interrupted', 'completed', 'cancelled', 'failed', 'completed_with_errors'];
let jobs = scenario === 'empty' || scenario === 'loggedout' ? [] : statuses.map((status, i) => ({ jobId:'synthetic-job-'+i, source:{ ...source, id:'synthetic-'+i }, title:['Вечерний вайб','Сияй','Пламя','Мой плейлист','Лучшее','Тихий вечер','Город','Дорога'][i], author:'Тестовый исполнитель', publicUrl:'https://music.yandex.ru/users/fixture/playlists/'+(i+1), status, tracks:Array.from({length:i===0?42:1}, (_,j)=>({trackKey:i+':'+j,status:status==='running'?'downloading':status==='completed'?'completed':status==='failed'||status==='completed_with_errors'?'failed':status==='cancelled'?'cancelled':'queued', ...(status==='completed'?{resultPath:'/Музыка/Yandex Music/Синтетический.mp3'}:{})})) }));
let entries = Array.from({length:50},(_,i)=>({ jobId:'history-'+i, source:{...source,kind:i%3===0?'playlist':i%3===1?'track':'album'}, title:'Архив '+String(i+1).padStart(2,'0')+' — '+['Вечерний вайб','Сияй','Лучшее','Пламя'][i%4], artists:i%3===0?[]:['Тестовый исполнитель'], count:i%3===0?42:i%3===1?1:12, bytes:i===49?null:13002342*(i+1), completedAt:new Date(2026,9,28-i,18,24).toISOString(), publicUrl:'https://music.yandex.ru/album/'+(1000+i), replayAvailable:i!==49, replayReason:i===49?'Откройте источник на Главной и выберите параметры.':null }));
const counters={history:0,historyArtwork:0,availability:0,folder:0,account:0,avatar:0,checkUpdate:0};
const waitingFolders=[];
let finishAvatar;

const listeners = new Set();
let sequence=0;
function emit(event) { for (const listener of listeners) listener(event); }
const api = {
 getSettings:async()=>ok(settings),
 saveSettings:async(value)=>{ settings={...settings,...Object.fromEntries(Object.entries(value).filter(([key])=>!['directoryRef','ffmpegRef'].includes(key))),...(value.directoryRef?{outputDirectory:'/Музыка/Новая коллекция'}:{})}; localStorage.setItem('step059-settings',JSON.stringify(settings)); return ok(settings); },
 appInfo:async()=>ok({version:'0.0.0-synthetic',dev:true}),
 account:async()=>{counters.account++;return ok(signedIn?{id:'synthetic-account',displayName:'Тестовый пользователь',email:'synthetic@example.test',region:'Тестовый регион',...(scenario==='unknown'?{subscriptionReason:'Сервис не передал достаточно данных, чтобы определить подписку.'}:{subscription:'Яндекс Плюс активен'})}:null);},
 accountAvatar:async()=>{counters.avatar++;if(scenario==='avatar-late')return new Promise(resolve=>{finishAvatar=()=>resolve(ok(art));});return ok(scenario==='unknown'||scenario==='avatar-fallback'?null:art);},
 authenticate:async()=>{signedIn=true;return api.account();}, logout:async()=>{signedIn=false;return ok(null);},
 resolve:async()=>ok(source),
 preview:async()=>ok({ source, kind:'playlist', title:'Вечерний вайб', ...(scenario==='preview-fallback'?{}:{author:'Тестовый автор', description:'Спокойная музыка для работы и отдыха', durationMs:774000, artwork:art, authorArtwork:art}), tracks:['Сияй','Пламя','Вечерний город','Мой плейлист'].map((title,i)=>({position:i+1, ...(scenario==='preview-fallback'?{}:{artwork:art}), track:{id:'track-'+i,title,artists:[{name:['NLO','Dose','ЛСП','42'][i]}], availability:'available',durationMs:204000-i*7000}})), qualities:[{preference:'best',available:4,total:4},{preference:'lossless',available:2,total:4},{preference:'high',available:4,total:4},{preference:'normal',available:4,total:4}], variants:[{selection:{codec:'mp3',container:'mp3',bitrate:320,lossless:false},available:4,total:4},{selection:{codec:'aac',container:'m4a',bitrate:256,lossless:false},available:2,total:4},{selection:{codec:'flac',container:'m4a',lossless:true},available:2,total:4},{selection:{codec:'flac',container:'flac',lossless:true},available:0,total:4}] }),
 selectDirectory:async()=>ok({directoryRef:'dir:00000000-0000-0000-0000-000000000058',displayPath:'/Музыка/Новая коллекция'}),
 createDownload:async()=>{const job={jobId:'synthetic-new',source,status:'queued',title:'Вечерний вайб',author:'Тестовый автор',tracks:[{trackKey:'new',status:'queued'}]};jobs.push(job);return ok(job);},
 listJobs:async()=>ok(jobs), getDownload:async({jobId})=>ok(jobs.find(j=>j.jobId===jobId)??null),
 downloadArtwork:async()=>ok(scenario==='preview-fallback'?null:art),
 clearDownloads:async()=>{const before=jobs.length;jobs=jobs.filter(j=>!['completed','cancelled','failed','completed_with_errors'].includes(j.status));return ok(before-jobs.length);},
 history:async()=>{counters.history++;return ok(scenario==='empty'?[]:entries);}, historyArtwork:async()=>{counters.historyArtwork++;return ok(art);},
 jobFolderAvailability:async({jobId})=>{counters.availability++;const result=()=>ok(jobId==='history-47'?{available:false,reason:'Файл или папка недоступны. Возможно, они перемещены или удалены.'}:{available:true});if(scenario==='availability-delayed')return new Promise(resolve=>waitingFolders.push(()=>resolve(result())));return result();},
 hideHistory:async({jobId})=>{entries=entries.filter(e=>e.jobId!==jobId);return ok(null);},
 replay:async()=>api.createDownload(), showItemInFolder:async({jobId})=>{counters.folder++;await new Promise(resolve=>setTimeout(resolve,350));return jobId==='history-48'?{schemaVersion:1,kind:'error',command:'showItemInFolder',error:{code:'PERMISSION_DENIED',message:'Файл или папка недоступны. Возможно, они перемещены или удалены.',retryable:false}}:ok(null);}, openDownloadsFolder:async()=>ok(null), openExternal:async()=>ok(null),
 ffmpegHelp:async()=>ok({platform:'linux',url:'https://ffmpeg.org/download.html#build-linux',instruction:'Linux: установите FFmpeg из репозитория дистрибутива.'}),
 checkFfmpeg:async()=>ok({available:false}), selectFfmpeg:async()=>ok(null),
 checkUpdate:async()=>{counters.checkUpdate++;return ok({status:'disabled',currentVersion:'0.0.0',message:'Обновления пока не настроены. Используйте проверенный portable-архив.'});},
 subscribe:(listener)=>{listeners.add(listener);return()=>listeners.delete(listener);}
};
for (const [method,status] of [['pause','paused'],['resume','running'],['cancel','cancelled'],['retry','queued']]) api[method]=async({jobId})=>{jobs=jobs.map(j=>j.jobId===jobId?{...j,status}:j);return ok(jobs.find(j=>j.jobId===jobId));};
window.step059Fixture={ api, counters, settleFolders:()=>waitingFolders.splice(0).forEach(resolve=>resolve()), settleAvatar:()=>finishAvatar?.(), notice:(status)=>{if(status==='cancelled')throw new Error('F-002: отмените активное задание через меню «Отменить»; core не публикует job.completed для отмены.');jobs=[{...jobs[0],status}];emit({schemaVersion:1,event:'job.completed',jobId:jobs[0].jobId,seq:++sequence,durationMs:0});}, progress:()=>emit({schemaVersion:1,event:'job.progress',jobId:jobs[0].jobId,seq:++sequence,payload:{completed:12,total:42,fraction:0.28}}) };
createRoot(document.getElementById('root')).render(React.createElement(App,{api}));
`;
await build({
  stdin: { contents: fixture, resolveDir: root, loader: 'jsx' },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  outfile: path.join(scratch, 'fixture.js'),
  loader: { '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' },
  logLevel: 'warning',
});
// Auth HTML принадлежит provider. Сервер собирает его отдельно от renderer и использует только тестовый код.
await build({
  entryPoints: [
    path.join(root, 'packages/providers/yandex-music/src/auth-page.ts'),
  ],
  outfile: path.join(scratch, 'auth-page.mjs'),
  platform: 'node',
  format: 'esm',
  logLevel: 'warning',
  footer: {
    js: "process.stdout.write(renderAuthPage('TEST-0058', 'https://ya.ru', '/auth', { deadline: Date.now() + 300000, duration: 300000 }));",
  },
});
const port = Number(process.env.STEP059_PORT ?? 4189);
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/auth') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    const rendered = spawnSync(
      process.execPath,
      [path.join(scratch, 'auth-page.mjs')],
      { encoding: 'utf8' },
    );
    if (rendered.status !== 0)
      throw new Error('Не удалось подготовить тестовую страницу входа');
    response.end(rendered.stdout);
    return;
  }
  if (url.pathname === '/auth/cancel') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (
    url.pathname === '/auth/icon.png' ||
    url.pathname === '/docs/brand/icon.png'
  ) {
    response.setHeader('Content-Type', 'image/png');
    response.end(await readFile(path.join(root, 'docs/brand/icon.png')));
    return;
  }
  if (url.pathname === '/fixture.js' || url.pathname === '/fixture.css') {
    response.setHeader(
      'Content-Type',
      url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
    );
    response.end(await readFile(path.join(scratch, url.pathname.slice(1))));
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(
    '<!doctype html><html lang="ru"><meta charset="utf-8"><title>STEP-059 · синтетическая fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>',
  );
});
server.listen(port, '127.0.0.1', () =>
  console.info(
    `STEP-059: http://127.0.0.1:${port} (scenario=empty|loggedout|normal|account-fallback|preview-fallback, theme=light|dark); auth: /auth`,
  ),
);
await writeFile(
  path.join(scratch, 'inputs.txt'),
  'Источник: apps/desktop/e2e/STEP-059-visual-fixture.mjs\nДанные синтетические; artwork взят из исторического input STEP-056, историческое Evidence не менялось.\n',
);
