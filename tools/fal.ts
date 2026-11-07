// Run one fal generation through its queue, keep the raw output, and log the call.
//
//   node tools/fal.ts <name> <endpoint> <arguments.json>
//
// Every call is paid and needs the owner's approval first. The raw outputs go to raw/
// (gitignored: the only copy), and fal-log.json gets the endpoint, arguments, request id,
// fal's billing headers and the files. Read the exact charge afterwards with
// tools/fal-usage.ts, since some endpoints' own cost fields are placeholders.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const [name, endpoint, argsPath] = process.argv.slice(2);
if (!name || !endpoint || !argsPath) throw new Error('usage: node tools/fal.ts <name> <endpoint> <arguments.json>');
const key = process.env.FAL_KEY;
if (!key) throw new Error('FAL_KEY is not set (it lives in ~/.config/env/global.env)');

const args = JSON.parse(readFileSync(argsPath, 'utf8')) as Record<string, unknown>;
const headers = {
  Authorization: `Key ${key}`,
  'Content-Type': 'application/json',
  // Only the model asked for may run, never a fallback.
  'x-app-fal-disable-fallback': 'true',
};

const started = new Date();
const submit = await fetch(`https://queue.fal.run/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(args) });
if (!submit.ok) throw new Error(`submit ${submit.status}: ${await submit.text()}`);
const job = (await submit.json()) as { request_id: string; status_url: string; response_url: string };
console.log(`submitted ${job.request_id}`);

for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await fetch(job.status_url, { headers });
  const status = (await res.json()) as { status: string };
  if (status.status === 'COMPLETED') break;
  if (!['IN_QUEUE', 'IN_PROGRESS'].includes(status.status)) throw new Error(`status ${JSON.stringify(status)}`);
}

const result = await fetch(job.response_url, { headers });
const billing = Object.fromEntries([...result.headers].filter(([h]) => h.startsWith('x-fal')));
const body = (await result.json()) as Record<string, unknown>;
if (!result.ok) throw new Error(`result ${result.status}: ${JSON.stringify(body)}`);

// Download every file URL in the result, untouched.
mkdirSync('raw', { recursive: true });
const files: string[] = [];
const urls: string[] = [];
const walk = (v: unknown): void => {
  if (typeof v === 'string' && /^https:\/\/\S+\.(mp4|webm|png|jpg|jpeg|webp|glb|mp3|wav)$/i.test(v)) urls.push(v);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
};
walk(body);
for (const [i, url] of urls.entries()) {
  const file = join('raw', `${name}${urls.length > 1 ? `-${i + 1}` : ''}${extname(new URL(url).pathname)}`);
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  writeFileSync(file, bytes);
  files.push(file);
  console.log(`saved ${file} (${bytes.length} bytes)`);
}

const logPath = 'fal-log.json';
const log = existsSync(logPath) ? (JSON.parse(readFileSync(logPath, 'utf8')) as unknown[]) : [];
log.push({
  name,
  endpoint,
  started: started.toISOString(),
  seconds: Math.round((Date.now() - started.getTime()) / 100) / 10,
  request_id: job.request_id,
  billing,
  arguments: args,
  result: body,
  files,
});
writeFileSync(logPath, `${JSON.stringify(log, null, 1)}\n`);
console.log(`logged in ${logPath}`, billing);
