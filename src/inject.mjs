// larp-tradingview injector, run with TradingView's own runtime (ELECTRON_RUN_AS_NODE=1), so no Node install is needed.
// Finds TradingView's local debug port, injects bg.js into its windows and serves videos to them.
// The page asks through the binding window.tvbg(json); answers go back through window.__tvbg.recv(msg).
import { readFileSync, readdirSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

const SUPPORT = join(homedir(), 'Library', 'Application Support');
const PORTFILE = process.argv[2] ?? join(SUPPORT, 'TradingView', 'DevToolsActivePort'); // optional arg: another profile
const DIR = join(SUPPORT, 'larp-tradingview', 'videos');
const BG = readFileSync(join(import.meta.dirname, 'bg.js'), 'utf8');
const EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const CHUNK = 4 << 20;
mkdirSync(DIR, { recursive: true });

const list = () => readdirSync(DIR).filter(f => EXT.has(extname(f).toLowerCase())).sort();
// trust boundary: any script on tradingview.com can call the binding, so accept bare video file names only
const safe = n => { const b = basename(String(n)); return b === n && EXT.has(extname(b).toLowerCase()) && !b.startsWith('.') ? b : null; };

const attached = new Set();

function attach(t) {
  attached.add(t.id);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  const reply = msg => send('Runtime.evaluate', { expression: `window.__tvbg && window.__tvbg.recv(${JSON.stringify(msg)})` });

  ws.onopen = () => {
    send('Runtime.enable');
    send('Runtime.addBinding', { name: 'tvbg' });
    send('Page.enable');
    send('Page.addScriptToEvaluateOnNewDocument', { source: BG });
    send('Runtime.evaluate', { expression: BG });
  };
  ws.onclose = () => attached.delete(t.id);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method !== 'Runtime.bindingCalled' || m.params.name !== 'tvbg') return;
    let q; try { q = JSON.parse(m.params.payload); } catch { return; }
    try {
      if (q.op === 'list') return reply({ rid: q.rid, files: list() });
      if (q.op === 'open') { execFile('open', [DIR]); return reply({ rid: q.rid, ok: true }); }
      const name = safe(q.name);
      if (!name) return reply({ rid: q.rid, error: 'bad file name' });
      if (q.op === 'get') {
        const buf = readFileSync(join(DIR, name));
        for (let i = 0; i < buf.length; i += CHUNK)
          reply({ rid: q.rid, chunk: buf.subarray(i, i + CHUNK).toString('base64'), last: i + CHUNK >= buf.length });
      } else if (q.op === 'add') {
        const p = join(DIR, name), data = Buffer.from(q.chunk, 'base64');
        q.first ? writeFileSync(p, data) : appendFileSync(p, data);
        reply({ rid: q.rid, ok: true });
      }
    } catch (err) { reply({ rid: q.rid, error: String(err.message) }); }
  };
}

// ponytail: polls every 2 s instead of Target.setDiscoverTargets; plenty for a few windows.
// The port is re-read each time because TradingView picks a new random one on every launch.
let misses = 0;
while (misses < 15) {
  try {
    const port = readFileSync(PORTFILE, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    misses = 0;
    for (const t of targets)
      if (t.type === 'page' && /^https:\/\/([\w-]+\.)*tradingview\.com\//.test(t.url) && !attached.has(t.id)) attach(t);
  } catch { misses++; } // TradingView closed for ~30 s → quit
  await new Promise(r => setTimeout(r, 2000));
}
process.exit(0);
