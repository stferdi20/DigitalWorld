/**
 * Widget chrome: the resizable frame, HUD, toolbar, the agent popup (chat / stats / log),
 * side panels (roster, recap, settings) and toasts. Plain DOM over the Phaser canvas.
 */
import { lineById } from '../data/roster';
import { SENIORITY } from '../data/types';
import { audio } from '../world/audio';
import { spriteFor } from '../world/sprites';
import { greeting, reply, thanks } from './lines';
import { formOf, xpForNext, type Critter, type Farm } from './state';
import type { FarmScene } from './FarmScene';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(100, v)))}%`;

export const SIZES = { S: [260, 110], M: [340, 150], L: [520, 230] } as const;
const MIN = [200, 90], MAX = [960, 640];

const CSS = `
:root { --hud: #0b1630f0; --ink: #e8f6ff; --cyan: #35e0ff; --yellow: #ffe680; --green: #7dff9a; --red: #ff6b6b; --dim: #8fb0c8;
  --mono: ui-monospace, "SF Mono", Menlo, monospace; color-scheme: dark; }
html, body { margin: 0; height: 100%; overflow: hidden; font: 12px/1.35 var(--mono); color: var(--ink);
  background: radial-gradient(120% 90% at 20% 10%, #3c5b8c 0%, #263a63 40%, #18223d 75%, #121a2e 100%); }
body.native { background: transparent; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--yellow); outline-offset: 1px; }

#frame { position: fixed; right: 10px; bottom: 6px; border: 2px solid var(--cyan); border-radius: 10px; overflow: hidden;
  background: #102a1a; box-shadow: 0 10px 30px #0009; container: frame / size; }
#frame.wiggle { animation: wiggle 0.5s ease-in-out 2; }
@keyframes wiggle { 25% { transform: rotate(-1.5deg); } 75% { transform: rotate(1.5deg); } }
@media (prefers-reduced-motion: reduce) { #frame.wiggle { animation: none; border-color: var(--yellow); } }
#farm, #farm canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
/* soften the map's own edges inside the frame */
#frame::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 18px 4px #050a14b0; border-radius: 8px; }

.hud { position: absolute; left: 6px; top: 6px; display: flex; gap: 4px; z-index: 3; pointer-events: none; }
.hud > span { background: var(--hud); border: 1px solid var(--cyan); border-radius: 3px; padding: 1px 6px; white-space: nowrap; }
.hud .need { border-color: var(--yellow); color: var(--yellow); }
.tools { position: absolute; right: 6px; top: 6px; display: flex; gap: 3px; z-index: 3; opacity: 0.85; transition: opacity 0.2s; }
.tools button { background: var(--hud); border: 1px solid var(--cyan); border-radius: 3px; padding: 1px 6px; min-width: 22px; }
.tools button .lbl { margin-left: 4px; }
#frame:hover .tools { opacity: 1; }
/* small frames: icons only, then hide the agent count, then tools only on hover */
@container frame (max-width: 460px) { .tools .lbl, .hud .lbl { display: none; } }
@container frame (max-width: 270px) { .hud .count { display: none; } }
@container frame (max-height: 105px) { .tools { opacity: 0; } #frame:hover .tools { opacity: 1; } }

/* resize: top-left corner grip plus the top and left edges (the frame is anchored bottom-right) */
.grip { position: absolute; z-index: 4; }
.grip.tl { left: 0; top: 0; width: 14px; height: 14px; cursor: nwse-resize;
  background: linear-gradient(135deg, var(--cyan) 0 2px, transparent 2px 5px, var(--cyan) 5px 7px, transparent 7px); opacity: 0.7; }
.grip.t { left: 14px; right: 0; top: 0; height: 5px; cursor: ns-resize; }
.grip.l { left: 0; top: 14px; bottom: 0; width: 5px; cursor: ew-resize; }
#sizehint { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 5; background: var(--hud);
  border: 1px solid var(--cyan); padding: 2px 8px; border-radius: 3px; pointer-events: none; }

/* popup + panels sit just above the frame, right-aligned */
.sheet { position: fixed; right: 10px; width: min(340px, calc(100vw - 20px)); max-height: calc(100vh - 40px);
  background: var(--hud); border: 2px solid var(--cyan); border-radius: 8px; box-shadow: 0 12px 30px #000a; z-index: 20;
  display: flex; flex-direction: column; }
.sheet header { display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-bottom: 1px solid #35e0ff44; }
.sheet header .x { margin-left: auto; background: none; border: 0; font-size: 14px; }
.sheet .body { padding: 8px 10px; overflow-y: auto; display: grid; gap: 8px; }
.thumb { width: 32px; height: 32px; image-rendering: pixelated; background-repeat: no-repeat; flex: none; }
.who b { color: var(--yellow); display: block; } .who span { color: var(--dim); }
.tabs { display: flex; gap: 2px; padding: 6px 10px 0; }
.tabs button { background: none; border: 1px solid #35e0ff55; border-bottom: 0; border-radius: 4px 4px 0 0; padding: 3px 10px; color: var(--dim); }
.tabs button[aria-selected="true"] { background: #14233a; color: var(--ink); border-color: var(--cyan); }
.approve { border: 1px solid var(--yellow); border-radius: 5px; padding: 7px 8px; display: grid; gap: 5px; background: #2a2410; }
.approve .t { color: var(--yellow); font-weight: 600; }
.approve code, .card code { color: var(--cyan); }
.row { display: flex; flex-wrap: wrap; gap: 4px; }
.btn { background: #14233a; border: 1px solid var(--cyan); border-radius: 3px; padding: 3px 8px; }
.btn.go { background: var(--cyan); color: #050a14; border-color: var(--cyan); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.log { display: grid; gap: 5px; max-height: 180px; overflow-y: auto; }
.msg { padding: 4px 7px; border-radius: 5px; max-width: 88%; }
.msg.them { background: #1f3a5a; } .msg.me { background: var(--cyan); color: #050a14; justify-self: end; }
.compose { display: flex; gap: 4px; padding: 0 10px 10px; }
.compose input { flex: 1; min-width: 0; font: inherit; background: #050a14; color: var(--ink); border: 1px solid #35e0ff66; border-radius: 3px; padding: 5px; }
.stats { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 8px; align-items: center; font-variant-numeric: tabular-nums; }
.meter { height: 6px; background: #000; border-radius: 2px; overflow: hidden; } .meter i { display: block; height: 100%; background: var(--green); }
.meter.low i { background: var(--red); }
.kv { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-variant-numeric: tabular-nums; }
.kv span:nth-child(odd) { color: var(--dim); }
.entries { display: grid; gap: 3px; } .entries div { display: flex; gap: 6px; } .entries time { color: var(--dim); flex: none; }
.soon { font-size: 10px; border: 1px solid var(--dim); color: var(--dim); border-radius: 3px; padding: 0 4px; margin-left: 4px; }
.roster button { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; background: #14233a; border: 1px solid #35e0ff44; border-radius: 5px; padding: 5px; }
.roster button:hover { border-color: var(--cyan); }
.roster .st { margin-left: auto; color: var(--dim); } .roster .st.q { color: var(--yellow); }
.setting { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.setting.off { color: var(--dim); }
h4 { margin: 4px 0 0; color: var(--yellow); font-size: 11px; letter-spacing: 0.08em; }
#toasts { position: fixed; right: 10px; display: grid; gap: 4px; z-index: 30; pointer-events: none; justify-items: end; }
.toast { background: var(--hud); border: 1px solid var(--cyan); border-radius: 5px; padding: 4px 8px; animation: tin 0.2s ease-out; max-width: 320px; }
.toast.y { border-color: var(--yellow); color: var(--yellow); }
@keyframes tin { from { transform: translateY(6px); opacity: 0; } }
.confirm { color: var(--yellow); }
`;

export function mountUI(farm: Farm, scene: FarmScene, resizeGame: () => void) {
  const st = farm.state;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  if ((window as unknown as { __TAURI__?: unknown }).__TAURI__) document.body.classList.add('native');

  const frame = $('#frame');
  frame.insertAdjacentHTML('beforeend', `
    <div class="hud"><span id="bits">◈ 0</span><span class="count" id="count"></span><span class="need" id="need" hidden></span></div>
    <div class="tools">
      <button id="t-roster" title="Roster">☰<span class="lbl">Roster</span></button>
      <button id="t-recap" title="Daily recap">▤<span class="lbl">Recap</span></button>
      <button id="t-settings" title="Settings">⚙</button>
    </div>
    <div class="grip tl" data-edge="tl" title="Drag to resize"></div><div class="grip t" data-edge="t"></div><div class="grip l" data-edge="l"></div>
    <div id="sizehint" hidden></div>`);
  document.body.insertAdjacentHTML('beforeend', `<div id="sheet" class="sheet" hidden></div><div id="toasts"></div>`);
  const sheet = $('#sheet');

  // ---- frame size: drag the top-left corner / top / left edge; presets in settings ----
  function applySize(w = st.settings.w, h = st.settings.h) {
    const vw = window.innerWidth - 20, vh = window.innerHeight - 12;
    st.settings.w = Math.round(Math.max(MIN[0], Math.min(MAX[0], vw, w)));
    st.settings.h = Math.round(Math.max(MIN[1], Math.min(MAX[1], vh, h)));
    frame.style.width = st.settings.w + 'px'; frame.style.height = st.settings.h + 'px';
    const above = st.settings.h + 14;
    sheet.style.bottom = above + 'px';
    placeToasts();
    resizeGame();
  }
  frame.querySelectorAll<HTMLElement>('.grip').forEach((g) => g.addEventListener('pointerdown', (e) => {
    e.preventDefault(); g.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, w0 = st.settings.w, h0 = st.settings.h, edge = g.dataset.edge!;
    const hint = $('#sizehint'); hint.hidden = false;
    const move = (m: PointerEvent) => {
      applySize(edge === 't' ? w0 : w0 + (sx - m.clientX), edge === 'l' ? h0 : h0 + (sy - m.clientY));
      hint.textContent = `${st.settings.w} × ${st.settings.h}`;
    };
    const up = () => { g.removeEventListener('pointermove', move); hint.hidden = true; farm.save(); };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up, { once: true });
  }));
  window.addEventListener('resize', () => applySize());
  applySize();

  // ---- toasts: above the frame, or beside the open popup so they never cover it ----
  function placeToasts() {
    const t = $('#toasts');
    t.style.bottom = (sheet.hidden ? st.settings.h + 14 : st.settings.h + 14) + 'px';
    t.style.right = sheet.hidden ? '10px' : `${Math.min(340, window.innerWidth - 20) + 18}px`;
  }
  function toast(text: string, yellow = false) {
    const t = document.createElement('div'); t.className = 'toast' + (yellow ? ' y' : ''); t.textContent = text;
    $('#toasts').prepend(t); setTimeout(() => t.remove(), 3500);
  }
  function attention(c: Critter) {
    if (st.settings.chime && st.settings.sound) audio.play('attention');
    if (st.settings.bounce) { frame.classList.remove('wiggle'); void frame.offsetWidth; frame.classList.add('wiggle'); }
    scene.hop(c.id);
  }

  // ---- HUD ----
  function hud() {
    $('#bits').textContent = `◈ ${st.bits.toLocaleString()}`;
    $('#count').innerHTML = `${st.critters.length}<span class="lbl"> agents</span>`;
    const need = st.critters.filter((c) => c.job?.approval).length;
    const n = $('#need'); n.hidden = !need; n.innerHTML = `❓ ${need}<span class="lbl"> needs you</span>`;
  }

  // ---- sheet (popup or panel) ----
  type View = { kind: 'agent'; id: string; tab: 'chat' | 'stats' | 'log' } | { kind: 'roster' | 'recap' | 'settings' | 'away' } | null;
  let view: View = null;
  let confirmReset = false;
  function open(v: View) { view = v; confirmReset = false; render(); }
  function close() { view = null; sheet.hidden = true; placeToasts(); }

  function thumb(c: Critter) {
    const s = spriteFor(c.formId);
    if (!s.url) return `<div class="thumb" style="background:${lineById(c.lineId).color};border-radius:50%"></div>`;
    const k = 32 / Math.max(s.frame[0], s.frame[1]);
    return `<div class="thumb" style="background-image:url(${s.url});background-size:${s.cols * s.frame[0] * k}px auto;
      background-position:-${(s.thumb % s.cols) * s.frame[0] * k}px -${Math.floor(s.thumb / s.cols) * s.frame[1] * k}px"></div>`;
  }
  const statusOf = (c: Critter) => (c.job?.approval ? '❓ needs you' : c.job ? `⌨ ${c.job.title}` : c.resting ? '💤 resting' : 'idle');
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; };

  function render() {
    if (!view) { sheet.hidden = true; placeToasts(); return; }
    sheet.hidden = false; placeToasts();
    const scroll = $('.log', sheet)?.scrollTop;
    if (view.kind === 'agent') {
      const c = farm.get(view.id); if (!c) return close();
      const f = formOf(c);
      const next = lineById(c.lineId).forms[lineById(c.lineId).forms.indexOf(f) + 1];
      const evoAt = Math.ceil((c.level + 1) / 5) * 5;
      const a = c.job?.approval;
      let body = '';
      if (view.tab === 'chat') {
        if (!c.chat.length) c.chat.push({ who: 'them', text: greeting(c) });
        body = `<div class="log" aria-live="polite">${c.chat.slice(-30).map((m) => `<div class="msg ${m.who}">${esc(m.text)}</div>`).join('')}</div>
          <div class="row">
            <button class="btn go" data-act="feed" ${st.bits < 20 ? 'disabled' : ''}>Feed · 20◈</button>
            <button class="btn" data-act="train" ${c.energy < 15 ? 'disabled' : ''}>Train</button>
            <button class="btn" data-act="job" ${c.job ? 'disabled' : ''}>Give a job</button>
            <button class="btn" data-act="rest" ${c.job ? 'disabled' : ''}>Rest</button>
          </div>`;
      } else if (view.tab === 'stats') {
        const m = (label: string, v: number, right: string) => `<span>${label}</span><div class="meter ${v < 30 ? 'low' : ''}"><i style="width:${pct(v)}"></i></div><span>${right}</span>`;
        body = `<div class="stats">${m('Energy', c.energy, pct(c.energy))}${m('Mood', c.mood, pct(c.mood))}${m('XP', (c.xp / xpForNext(c.level)) * 100, `${c.xp}/${xpForNext(c.level)}`)}</div>
          <div class="kv"><span>Level</span><span>${c.level}</span>
            <span>Seniority</span><span>${SENIORITY[f.stage]}</span>
            <span>Next digivolution</span><span>${next ? `Lv ${evoAt} → ${esc(next.name)}` : 'final form'}</span>
            <span>Jobs today</span><span>${c.jobsToday}</span>
            <span>Bits earned today</span><span>◈ ${c.earnedToday}</span>
            <span>Cost today <span class="soon">simulated</span></span><span>$${c.costToday.toFixed(2)}</span></div>`;
      } else {
        body = `<div class="entries">${c.log.slice(0, 30).map((l) => `<div><time>${ago(l.at)}</time><span>${esc(l.text)}</span></div>`).join('') || '<div>Nothing yet.</div>'}</div>`;
      }
      sheet.innerHTML = `<header>${thumb(c)}<div class="who"><b>${esc(c.name)}</b><span>${esc(f.name)} · Lv ${c.level} · ${esc(statusOf(c))}</span></div>
          <button class="x" aria-label="Close">✕</button></header>
        ${a ? `<div class="body"><div class="approve"><span class="t">❓ ${esc(c.name)} wants to run</span><code>${esc(a.command)}</code>
          <span>while working on "${esc(c.job!.title)}"</span>
          <div class="row"><button class="btn go" data-ans="allow">Allow</button><button class="btn" data-ans="deny">Deny</button><button class="btn" data-ans="later">Later</button></div></div></div>` : ''}
        <div class="tabs" role="tablist">${(['chat', 'stats', 'log'] as const).map((t) => `<button role="tab" data-tab="${t}" aria-selected="${view!.kind === 'agent' && view!.tab === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        <div class="body">${body}</div>
        ${view.tab === 'chat' ? `<form class="compose"><input id="say" placeholder="Say something to ${esc(c.name)}…" aria-label="Message" autocomplete="off"><button class="btn go">Send</button></form>` : ''}`;
      sheet.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => (b.onclick = () => { (view as { tab: string }).tab = b.dataset.tab!; render(); }));
      sheet.querySelectorAll<HTMLElement>('[data-ans]').forEach((b) => (b.onclick = () => { farm.answer(c, b.dataset.ans as 'allow'); hud(); render(); }));
      sheet.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => (b.onclick = () => {
        const act = b.dataset.act;
        const ok = act === 'feed' ? farm.feed(c) : act === 'train' ? farm.train(c) : act === 'job' ? (farm.startJob(c), true) : (farm.rest(c), true);
        if (ok) c.chat.push({ who: 'them', text: act === 'feed' ? thanks(c) : act === 'train' ? 'Hup! Training!' : act === 'job' ? `On it: "${c.job?.title}"` : 'Nap time…' });
        render(); hud();
      }));
      const form = $<HTMLFormElement>('form.compose', sheet);
      if (form) form.onsubmit = (e) => {
        e.preventDefault();
        const inp = $<HTMLInputElement>('#say', sheet); const t = inp.value.trim(); if (!t) return;
        c.chat.push({ who: 'me', text: t });
        c.mood = Math.min(100, c.mood + 2);
        render();
        setTimeout(() => { c.chat.push({ who: 'them', text: reply(c, t) }); if (view?.kind === 'agent' && view.id === c.id) render(); }, 450);
      };
    } else if (view.kind === 'roster') {
      sheet.innerHTML = `<header><b>ROSTER</b><button class="x" aria-label="Close">✕</button></header>
        <div class="body roster">${st.critters.map((c) => `<button data-open="${c.id}">${thumb(c)}<span><b>${esc(c.name)}</b><br>Lv ${c.level} · ${esc(formOf(c).name)}</span><span class="st ${c.job?.approval ? 'q' : ''}">${esc(statusOf(c))}</span></button>`).join('')}
          <button class="btn" disabled>+ Hire from Digidex<span class="soon">soon</span></button></div>`;
      sheet.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => (b.onclick = () => open({ kind: 'agent', id: b.dataset.open!, tab: 'chat' })));
    } else if (view.kind === 'recap') {
      const r = farm.recap();
      sheet.innerHTML = `<header><b>FARM REPORT · ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b><button class="x" aria-label="Close">✕</button></header>
        <div class="body"><div class="kv"><span>Jobs done</span><span>${r.jobs}</span><span>Bits earned</span><span>◈ ${r.bits}</span>
          <span>Spent today <span class="soon">simulated</span></span><span>$${r.cost.toFixed(2)}</span>
          <span>Hardest worker</span><span>${r.top ? esc(r.top.name) + ` (${r.top.jobsToday})` : '-'}</span>
          <span>Tired</span><span>${r.tired.map((c) => esc(c.name)).join(', ') || 'nobody'}</span></div>
          <div class="row"><button class="btn go" id="feedall" ${st.bits < 20 * r.tired.length || !r.tired.length ? 'disabled' : ''}>Feed the tired ones · ${20 * r.tired.length}◈</button>
          <button class="btn" disabled>Send to phone<span class="soon">soon</span></button></div>
          <span style="color:var(--dim)">An automatic recap at a time you choose is coming with the desktop app.</span></div>`;
      const fa = $('#feedall', sheet); if (fa) fa.onclick = () => { for (const c of r.tired) farm.feed(c); toast('Fed everyone who was tired'); render(); hud(); };
    } else if (view.kind === 'settings') {
      const tog = (k: 'sound' | 'chime' | 'bounce' | 'bubble', label: string) => `<label class="setting">${label}<input type="checkbox" data-set="${k}" ${st.settings[k] ? 'checked' : ''}></label>`;
      const soon = (label: string) => `<label class="setting off">${label}<span class="soon">soon</span></label>`;
      sheet.innerHTML = `<header><b>SETTINGS</b><button class="x" aria-label="Close">✕</button></header>
        <div class="body">
          <h4>FRAME SIZE</h4><div class="row">${Object.entries(SIZES).map(([k, [w, h]]) => `<button class="btn ${st.settings.w === w && st.settings.h === h ? 'go' : ''}" data-size="${k}">${k} · ${w}×${h}</button>`).join('')}</div>
          <span style="color:var(--dim)">Or drag the frame's top-left corner.</span>
          <h4>ALERTS</h4>${tog('bubble', 'Bubbles over agents')}${tog('chime', 'Chime when someone needs you')}${tog('bounce', 'Wiggle the frame')}${tog('sound', 'Sound')}
          <h4>SIMULATION</h4><div class="row">${[1, 4, 16].map((s) => `<button class="btn ${st.settings.speed === s ? 'go' : ''}" data-speed="${s}">${s}×</button>`).join('')}</div>
          <h4>COMING SOON</h4>${soon('Connect Claude Code sessions')}${soon('Real token cost')}${soon('Daily recap at a set time')}${soon('Phone view')}${soon('More farms & locations')}${soon('Launch at login')}
          <h4>DATA</h4><div class="row"><button class="btn" id="reset">${confirmReset ? '<span class="confirm">Tap again to reset the farm</span>' : 'Reset farm'}</button></div>
        </div>`;
      sheet.querySelectorAll<HTMLInputElement>('[data-set]').forEach((i) => (i.onchange = () => { (st.settings as unknown as Record<string, boolean>)[i.dataset.set!] = i.checked; audio.settings.on = st.settings.sound; farm.save(); }));
      sheet.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => (b.onclick = () => { const [w, h] = SIZES[b.dataset.size as keyof typeof SIZES]; applySize(w, h); farm.save(); render(); }));
      sheet.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => (b.onclick = () => { st.settings.speed = +b.dataset.speed!; farm.save(); render(); }));
      $('#reset', sheet).onclick = () => {
        if (!confirmReset) { confirmReset = true; render(); return; }
        try { localStorage.removeItem('dw.widget.v1'); } catch { /* ignore */ }
        location.reload();
      };
    } else if (view.kind === 'away' && farm.away) {
      const a = farm.away, h = Math.floor(a.seconds / 3600), m = Math.round((a.seconds % 3600) / 60);
      sheet.innerHTML = `<header><b>WHILE YOU WERE AWAY</b><button class="x" aria-label="Close">✕</button></header>
        <div class="body"><span>${h ? `${h}h ` : ''}${m}m on the farm:</span>
          <div class="kv"><span>Jobs done</span><span>${a.jobs}</span><span>Bits earned</span><span>◈ ${a.bits}</span><span>Level-ups</span><span>${a.levels}</span></div>
          <div class="row"><button class="btn go" id="collect">Collect</button></div></div>`;
      $('#collect', sheet).onclick = close;
    }
    const x = $('.x', sheet); if (x) x.onclick = close;
    const log = $('.log', sheet); if (log) log.scrollTop = view.kind === 'agent' && view.tab === 'chat' ? 1e6 : scroll ?? 0;
  }

  $('#t-roster').onclick = () => open(view?.kind === 'roster' ? null : { kind: 'roster' });
  $('#t-recap').onclick = () => open(view?.kind === 'recap' ? null : { kind: 'recap' });
  $('#t-settings').onclick = () => open(view?.kind === 'settings' ? null : { kind: 'settings' });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  scene.onPick = (id) => { open({ kind: 'agent', id, tab: farm.get(id)?.job?.approval ? 'chat' : 'chat' }); audio.play('select'); };

  // ---- farm events ----
  farm.on((e) => {
    if (e.type === 'approval') { toast(`❓ ${e.c.name} needs your OK: ${e.c.job?.approval?.command}`, true); attention(e.c); }
    if (e.type === 'job.done') { toast(`✅ ${e.c.name} finished · +${e.bits}◈`); if (st.settings.sound) audio.play('done'); }
    if (e.type === 'level') toast(`⬆ ${e.c.name} reached Lv ${e.c.level}`);
    if (e.type === 'evolve') { toast(`✨ ${e.from.name} digivolved to ${e.to.name}!`, true); if (st.settings.sound) audio.play('evolve'); scene.sync(); scene.walkers.get(e.c.id) && scene.skin(scene.walkers.get(e.c.id)!); }
    hud();
    if (view && (view.kind !== 'agent' || !('c' in e) || view.id === e.c.id) && !(document.activeElement?.id === 'say')) render();
  });
  // keep the open sheet's numbers fresh without stealing typing focus
  setInterval(() => { hud(); if (view && view.kind !== 'settings' && document.activeElement?.id !== 'say') render(); }, 1000);
  hud();
  if (farm.away && farm.away.jobs > 0) open({ kind: 'away' });
}
