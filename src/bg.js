// larp-tradingview: looping video background for TradingView Desktop. Menu: Ctrl+B.
(() => {
  if (window.__tvbg || !location.hostname.endsWith('tradingview.com')) return;
  const pl = navigator.language.startsWith('pl');
  const T = pl ? {
    title: 'Tło wykresu  ·  Ctrl+B', off: '— wyłączone —', opacity: 'Krycie', whole: 'Całe okno (lista par, paski)',
    ink: 'Auto kolor tekstu pod film', font: 'Czcionka', add: '+ Dodaj filmik…', folder: 'Otwórz folder z filmami',
    upload: 'Wgrywam', nolink: 'brak połączenia z larp-tradingview (uruchom instalator jeszcze raz)',
  } : {
    title: 'Chart background  ·  Ctrl+B', off: '— off —', opacity: 'Opacity', whole: 'Whole window (watchlist, toolbars)',
    ink: 'Auto text color from video', font: 'Font', add: '+ Add video…', folder: 'Open videos folder',
    upload: 'Uploading', nolink: 'not connected to larp-tradingview (run the installer again)',
  };
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('tvbg.' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tvbg.' + k, JSON.stringify(v)); } catch {} },
  };
  let current = store.get('current', null), opacity = store.get('opacity', 0.5), full = store.get('full', true),
    auto = store.get('auto', true), font = store.get('font', 'Avenir Next');
  const pending = new Map(), blobs = new Map();
  let ink = null, dark = false; // auto text color, see below
  let rid = 0;

  const ask = q => new Promise((ok, fail) => {
    if (!window.tvbg) return fail(new Error(T.nolink));
    q.rid = ++rid;
    pending.set(q.rid, { ok, fail, parts: [] });
    window.tvbg(JSON.stringify(q));
  });
  window.__tvbg = {
    recv(m) {
      const p = pending.get(m.rid);
      if (!p) return;
      if (m.error) { pending.delete(m.rid); return p.fail(new Error(m.error)); }
      if (m.chunk === undefined) { pending.delete(m.rid); return p.ok(m); }
      p.parts.push(Uint8Array.from(atob(m.chunk), c => c.charCodeAt(0)));
      if (m.last) { pending.delete(m.rid); p.ok(new Blob(p.parts, { type: 'video/mp4' })); }
    },
  };

  // TradingView's CSP blocks file:// and localhost, but blob: is allowed
  async function url(name) {
    if (!blobs.has(name)) blobs.set(name, URL.createObjectURL(await ask({ op: 'get', name })));
    return blobs.get(name);
  }

  // --- video layer ---
  const video = Object.assign(document.createElement('video'), { muted: true, loop: true, autoplay: true, playsInline: true });
  video.id = 'tvbg-video';
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  const layer = document.createElement('div');
  layer.id = 'tvbg-layer';
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;display:none;';
  layer.append(video);

  // TradingView paints pane and axis backgrounds with one full-canvas fillRect; turn that into clearRect.
  // ponytail: depends on .chart-gui-wrapper / .chart-container-border; re-check these after a TradingView update
  const fillRect = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    const c = this.canvas, m = this.getTransform(); // axes draw in CSS px with a retina scale
    if (current && m.a * x + m.e <= 0 && m.d * y + m.f <= 0 && m.a * w >= c.width && m.d * h >= c.height &&
        (full ? c.closest?.('.chart-container-border') : c.parentElement?.classList.contains('chart-gui-wrapper'))) {
      if (!full && typeof this.fillStyle === 'string') layer.style.background = this.fillStyle;
      this.__tvbgBadge = false;
      return this.clearRect(x, y, w, h);
    }
    return fillRect.apply(this, arguments);
  };
  // axis scale labels follow the auto text color; text on badges (High/Low, last price) stays as is
  // ponytail: "badge" = a fill() since the frame started; if TradingView changes its draw order some labels stay white
  const fill = CanvasRenderingContext2D.prototype.fill, fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fill = function () { this.__tvbgBadge = true; return fill.apply(this, arguments); };
  CanvasRenderingContext2D.prototype.fillText = function () {
    if (ink && !this.__tvbgBadge && this.canvas.closest?.('.price-axis,.time-axis')) {
      const f = this.fillStyle; this.fillStyle = ink.text;
      try { return fillText.apply(this, arguments); } finally { this.fillStyle = f; }
    }
    return fillText.apply(this, arguments);
  };
  const redraw = () => dispatchEvent(new Event('resize'));

  async function play(name) {
    current = name;
    store.set('current', name);
    redraw();
    place();
    if (!name) { video.removeAttribute('src'); video.load(); layer.style.display = 'none'; render(); return; }
    layer.style.display = '';
    video.style.opacity = opacity;
    try { video.src = await url(name); await video.play(); } catch (e) { status(e.message); }
    render();
  }

  // Whole-window mode: theme background variables go transparent, the layer sits fixed under the whole page.
  // ponytail: variable list from TradingView 3.4.1; if a panel turns opaque after an update, add its variable here
  const VARS = ['--color-header-bg', '--color-body-bg', '--color-body-secondary-bg', '--color-bg-primary', '--color-bg-secondary',
    '--color-bg-highlight', '--color-legacy-bg-widget', '--color-chart-page-bg', '--color-pane-bg', '--color-pane-secondary-bg',
    '--color-widget-pages-bg', '--color-background-special-primary', '--color-background-primary', '--color-list-nth-child-bg',
    '--color-screener-header-bg', '--tv-color-pane-background', '--color-background-secondary-inverse'];
  // only the main layout goes transparent; dialogs and menus (#overlap-manager-root) get frosted glass
  const fullCss = document.createElement('style');
  fullCss.textContent = `.js-rootresizer__contents.js-rootresizer__contents{${VARS.map(v => v + ':transparent!important').join(';')}}
    html{--tvbg-glass:rgb(255 255 255/.82);--tvbg-shadow:rgb(255 255 255/.7)}
    html.theme-dark{--tvbg-glass:rgb(19 19 19/.82);--tvbg-shadow:rgb(0 0 0/.7)}
    body{background:transparent!important}
    .js-rootresizer__contents{text-shadow:0 1px 2px var(--tvbg-shadow)}
    :is(.layout__area--top,.layout__area--topleft,.layout__area--left,.layout__area--right,.layout__area--bottom){backdrop-filter:blur(14px)}
    #overlap-manager-root{--color-bg-primary:var(--tvbg-glass);--color-popup-background:var(--tvbg-glass);--tv-color-popup-background:var(--tvbg-glass)}
    :is(#overlap-manager-root :is([class^=dialog-],[class^=menuWrap-],[class^=popupWidgetWrapper-],[class^=popupStyle-]),.tv-floating-toolbar){
      backdrop-filter:blur(20px) saturate(1.3);border-radius:12px!important;overflow:hidden}`;
  let base = '';

  const FONTS = ['', 'Avenir Next', 'Futura', 'Gill Sans', 'Optima', 'Rockwell', 'Menlo'];
  const fontCss = document.createElement('style');
  function setFont() {
    fontCss.textContent = font ? `body,body *{font-family:"${font}",-apple-system,sans-serif!important;font-variant-numeric:tabular-nums}` : '';
    if (!fontCss.isConnected) document.head?.append(fontCss);
  }

  // Auto text color: every second, average the frame → light or dark text tinted with the video's hue
  const TEXT = ['--color-text-primary', '--color-text-regular', '--color-list-item-text', '--color-toolbar-button-text',
    '--color-toolbar-interactive-element-text-normal', '--color-item-active-text', '--color-alert-text',
    '--color-content-primary-neutral-bold', '--color-content-primary-neutral-semi-bold', '--color-content-secondary-neutral-bold',
    '--color-content-secondary-neutral-semi-bold', '--color-content-secondary-neutral-medium', '--color-content-tertiary-neutral-bold'];
  const DIM = ['--color-text-secondary', '--color-text-tertiary', '--color-default-gray', '--color-symbol-change-neutral',
    '--color-content-primary-neutral', '--color-content-primary-neutral-normal', '--color-content-secondary-neutral'];
  const inkCss = document.createElement('style'), probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  probe.canvas.width = 16; probe.canvas.height = 9;

  setInterval(() => {
    const on = auto && full && !!current && video.readyState >= 2;
    if (!on) { if (ink) { ink = null; inkCss.remove(); redraw(); } return; }
    probe.drawImage(video, 0, 0, 16, 9);
    const d = probe.getImageData(0, 0, 16, 9).data, b = (base.match(/\d+/g) || [0, 0, 0]).map(Number);
    let rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) rgb[k] += d[i + k];
    rgb = rgb.map((v, k) => v / (d.length / 4) * opacity + b[k] * (1 - opacity)); // what is actually visible behind the text
    const [h, sat] = hsl(rgb), L = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    dark = dark ? L > 0.4 : L > 0.5; // hysteresis so it doesn't flicker at the boundary
    const hue = Math.round(h / 15) * 15, s = Math.round(Math.min(sat, 0.7) * 10) * 10;
    const text = dark ? `hsl(${hue} ${s}% 12%)` : `hsl(${hue} ${s * 0.5}% 92%)`;
    if (ink?.text === text) return;
    ink = { text };
    const dim = dark ? `hsl(${hue} ${s}% 22%)` : `hsl(${hue} ${s * 0.5}% 78%)`;
    // main layout only; dialogs keep the theme colors on their glass background
    inkCss.textContent = `.js-rootresizer__contents.js-rootresizer__contents{${TEXT.map(v => `${v}:${text}!important`).join(';')};${DIM.map(v => `${v}:${dim}!important`).join(';')}}
      .js-rootresizer__contents{text-shadow:0 1px 2px ${dark ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.7)'}!important}`;
    if (!inkCss.isConnected) document.head.append(inkCss);
    redraw();
  }, 1000);
  function hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0];
    const h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, d / (1 - Math.abs(2 * l - 1))];
  }

  // ponytail: in chart-only mode just the first chart of a multi-chart layout. TradingView rebuilds its layout, so keep the layer in place (first child = lowest)
  function place() {
    if (!document.body) return;
    if (!base) base = getComputedStyle(document.body).backgroundColor;
    if (!fontCss.isConnected) setFont();
    const on = full && !!current;
    if (on !== fullCss.isConnected) { on ? document.head.append(fullCss) : fullCss.remove(); redraw(); }
    const area = full ? document.body : document.querySelector('.chart-container-border');
    if (!area || layer.parentElement === area) return;
    layer.style.position = full ? 'fixed' : 'absolute';
    layer.style.zIndex = full ? '-1' : '0';
    if (full) layer.style.background = base;
    else if (getComputedStyle(area).position === 'static') area.style.position = 'relative';
    area.prepend(layer);
    redraw();
    if (video.paused && video.src) video.play().catch(() => {});
  }
  setInterval(place, 1000);
  document.addEventListener('visibilitychange', () => document.hidden ? video.pause() : video.src && video.play().catch(() => {}));

  // --- menu ---
  const menu = document.createElement('div');
  menu.id = 'tvbg-menu';
  menu.style.cssText = 'position:fixed;top:60px;right:20px;width:280px;max-height:70vh;overflow:auto;z-index:100000;display:none;' +
    'background:rgba(19,23,34,.96);color:#d1d4dc;border:1px solid #363a45;border-radius:10px;padding:12px;font:13px -apple-system,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);';
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'video/*', multiple: true });
  input.style.display = 'none';
  let files = [], msg = '';

  const status = t => { msg = t; render(); };
  const row = (label, active, onclick) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `padding:6px 8px;border-radius:6px;cursor:pointer;${active ? 'background:#2962ff;color:#fff;' : ''}`;
    b.onmouseenter = () => !active && (b.style.background = '#2a2e39');
    b.onmouseleave = () => !active && (b.style.background = '');
    b.onclick = onclick;
    return b;
  };
  const check = (label, value, onchange) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer;';
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: value });
    box.onchange = () => onchange(box.checked);
    l.append(box, label);
    return l;
  };
  const button = (label, onclick, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `width:100%;padding:7px;margin-top:4px;border:0;border-radius:6px;background:${bg};color:#fff;cursor:pointer;font:inherit;`;
    b.onclick = onclick;
    return b;
  };

  function render() {
    menu.replaceChildren();
    const h = document.createElement('div');
    h.textContent = T.title;
    h.style.cssText = 'font-weight:600;margin-bottom:8px;';
    menu.append(h, row(T.off, !current, () => play(null)));
    for (const f of files) menu.append(row(f.replace(/\.[^.]+$/, ''), f === current, () => play(f)));

    const op = document.createElement('label');
    op.style.cssText = 'display:flex;align-items:center;gap:8px;margin:10px 0 6px;';
    op.textContent = T.opacity;
    const slider = Object.assign(document.createElement('input'), { type: 'range', min: 0.05, max: 1, step: 0.05, value: opacity });
    slider.style.flex = '1';
    slider.oninput = () => { opacity = +slider.value; video.style.opacity = opacity; store.set('opacity', opacity); };
    op.append(slider);

    const fontRow = document.createElement('label');
    fontRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;';
    const pick = document.createElement('select');
    pick.style.cssText = 'flex:1;background:#2a2e39;color:inherit;border:0;border-radius:6px;padding:4px;font:inherit;';
    for (const f of FONTS) pick.append(new Option(f || 'TradingView', f, false, f === font));
    pick.onchange = () => { font = pick.value; store.set('font', font); setFont(); };
    fontRow.append(T.font, pick);

    menu.append(op,
      check(T.whole, full, v => { full = v; store.set('full', v); place(); }),
      check(T.ink, auto, v => { auto = v; store.set('auto', v); }),
      fontRow,
      button(T.add, () => input.click(), '#2962ff'),
      button(T.folder, () => ask({ op: 'open' }).catch(e => status(e.message)), '#2a2e39'),
      input);
    if (msg) { const s = document.createElement('div'); s.textContent = msg; s.style.cssText = 'margin-top:8px;color:#9598a1;'; menu.append(s); }
  }

  async function refresh() {
    try { files = (await ask({ op: 'list' })).files; msg = ''; } catch (e) { msg = e.message; }
    render();
  }

  input.onchange = async () => {
    for (const file of input.files) {
      const name = file.name.replace(/[^\w.\-]+/g, '_');
      const CH = 2 << 20;
      try {
        for (let i = 0; i < file.size; i += CH) {
          status(`${T.upload} ${name}… ${Math.round(i / file.size * 100)}%`);
          const b64 = (await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file.slice(i, i + CH)); })).split(',')[1];
          await ask({ op: 'add', name, chunk: b64, first: i === 0 });
        }
        blobs.set(name, URL.createObjectURL(file));
        msg = '';
        await refresh();
        play(name);
      } catch (e) { status(e.message); }
    }
    input.value = '';
  };

  addEventListener('keydown', e => {
    if (!(e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyB')) return;
    e.preventDefault(); e.stopPropagation();
    if (!menu.isConnected) document.body.append(menu);
    const open = menu.style.display === 'none';
    menu.style.display = open ? 'block' : 'none';
    if (open) refresh();
  }, true);

  // first run: start with the first video in the folder
  const start = async () => {
    if (current === null && !store.get('started', false)) { await refresh(); current = files[0] ?? null; store.set('started', true); }
    if (current) play(current);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
})();
