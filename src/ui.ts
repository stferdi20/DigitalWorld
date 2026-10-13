import type { Agent } from './agents/Agent';
import { LINES, addCustomLine, allForms, lineById } from './data/roster';
import { allSprites, currentMapping, setSpriteFor, spriteFor, type SpriteInfo } from './world/sprites';
import { ROLES, SENIORITY, type Role } from './data/types';
import type { OfficeScene } from './scenes/OfficeScene';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function mountUI(scene: OfficeScene) {
  document.body.insertAdjacentHTML('beforeend', `
  <div id="topbar" class="panel">
    <b>DIGITAL WORLD OFFICE</b>
    <span id="stats"></span>
    <button id="roof" title="R"></button>
    <button id="walls" title="W"></button>
    <span><button id="st-dn" title="PgDn">▼</button> <b id="storey"></b> <button id="st-up" title="PgUp">▲</button></span>
    <button id="speed"></button>
    <label><input type="checkbox" id="dark" checked> dark digivolution</label>
  </div>
  <div id="left" class="panel">
    <h3>HIRE A DIGIMON</h3>
    <select id="h-line">${LINES.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>
    <select id="h-form"></select>
    <select id="h-role">${ROLES.map((r) => `<option>${r}</option>`).join('')}</select>
    <input id="h-name" placeholder="agent name (optional)">
    <button id="h-go">Hire</button>
    <button id="h-dex">Hire from Digidex…</button>
    <h3>AGENTS</h3>
    <div id="list"></div>
  </div>
  <div id="right" class="panel" hidden></div>
  <div id="board" class="panel"><div><h4>DOING</h4><div id="doing"></div></div><div><h4>DONE</h4><div id="done"></div></div></div>
  <div id="dex" class="panel" hidden>
    <div class="dex-head"><b id="dex-title">DIGIDEX</b>
      <input id="dex-q" placeholder="filter: #0147, 64, …" size="16">
      <button id="dex-export" title="Download your picks as dusk-map.json">Export picks</button>
      <button id="dex-reset">Use default</button>
      <button id="dex-close">✕</button></div>
    <div id="dex-grid"></div>
  </div>
  <style>
    [hidden] { display: none !important; }
    #dex { inset: 60px 220px 120px 220px; display: flex; flex-direction: column; z-index: 10; }
    .dex-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    #dex-grid { flex: 1; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 4px; margin-top: 6px; }
    .dx { background: #1f5f4a; border: 1px solid transparent; border-radius: 3px; cursor: pointer; text-align: center; padding: 2px; }
    .dx:hover { border-color: #ffe680; } .dx.cur { border-color: #7dff9a; background: #2f7f5a; }
    .dx i { display: block; margin: 0 auto; image-rendering: pixelated; background-repeat: no-repeat; }
    .dx span { font-size: 9px; color: #ffe680; }
    @media (max-width: 700px) { #dex { inset: 60px 8px 120px 8px; } }
    .panel { position: fixed; background: #0b1630e6; color: #dff6ff; font: 11px monospace; border: 2px solid #35e0ff;
      border-radius: 4px; padding: 6px; box-shadow: 0 0 0 2px #050a14; }
    .panel button, .panel select, .panel input { font: 11px monospace; background: #14233a; color: #dff6ff;
      border: 1px solid #35e0ff; border-radius: 3px; padding: 2px 6px; margin: 2px 0; }
    .panel button:hover { background: #1f3a5a; cursor: pointer; }
    .panel h3, .panel h4 { margin: 6px 0 4px; color: #ffe680; font-size: 11px; }
    #topbar { top: 8px; left: 8px; right: 8px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    #left { top: 52px; left: 8px; width: 190px; max-height: calc(100vh - 190px); overflow: auto; display: flex; flex-direction: column; }
    #right { top: 52px; right: 8px; width: 230px; max-height: calc(100vh - 190px); overflow: auto; }
    #board { bottom: 8px; left: 8px; right: 8px; height: 100px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; overflow: hidden; }
    #board > div { overflow: auto; }
    .row { padding: 2px 4px; cursor: pointer; border-radius: 2px; }
    .row:hover, .row.sel { background: #1f3a5a; }
    .st { color: #7dff9a; } .st.blocked { color: #ff6b6b; } .st.waiting_input { color: #ffe680; }
    .xp { height: 5px; background: #000; margin: 3px 0; } .xp > i { display: block; height: 100%; background: #ffe680; }
    .log { max-height: 140px; overflow: auto; background: #050a14; padding: 4px; margin-top: 4px; }
    @media (max-width: 700px) { #left, #right { width: calc(50vw - 24px); } }
  </style>`);

  const formSel = $<HTMLSelectElement>('#h-form');
  const fillForms = () => {
    const l = lineById($<HTMLSelectElement>('#h-line').value);
    formSel.innerHTML = l.forms.map((f) => `<option value="${f.id}" ${f.stage === 'rookie' ? 'selected' : ''}>${esc(f.name)} (${SENIORITY[f.stage]})</option>`).join('');
  };
  $('#h-line').onchange = fillForms;
  fillForms();
  $('#h-go').onclick = () => {
    const a = scene.hire($<HTMLSelectElement>('#h-line').value, formSel.value,
      $<HTMLSelectElement>('#h-role').value as Role, $<HTMLInputElement>('#h-name').value || undefined);
    if (!a) alert('No free desks!'); else scene.select(a);
  };
  $('#roof').onclick = () => scene.cycleRoof();
  $('#walls').onclick = () => scene.cycleWalls();
  $('#st-up').onclick = () => scene.setStorey(scene.viewStorey + 1);
  $('#st-dn').onclick = () => scene.setStorey(scene.viewStorey - 1);
  $('#speed').onclick = () => { scene.speed = ({ 1: 2, 2: 4, 4: 1 } as Record<number, number>)[scene.speed]; refresh(); };
  $<HTMLInputElement>('#dark').onchange = (e) => { scene.darkEvolution = (e.target as HTMLInputElement).checked; };

  const done: string[] = [];
  let lastLogLen = new Map<string, string>();

  function refresh() {
    const agents = [...scene.agents.values()];
    $('#stats').textContent = `agents ${agents.length} · working ${agents.filter((a) => a.task).length}`;
    $('#roof').textContent = `Roof: ${scene.roofMode}`;
    $('#walls').textContent = `Walls: ${scene.wallMode}`;
    $('#storey').textContent = scene.viewStorey === 2 ? 'Floor 2 · Executive' : 'Floor 1 · Main';
    $('#speed').textContent = `Speed: ${scene.speed}x`;
    $('#list').innerHTML = agents.map((a) => `<div class="row ${a === scene.selected ? 'sel' : ''}" data-id="${a.id}">
      ${esc(a.name)} · ${esc(a.form.name)} <small>F${a.storey}</small> <span class="st ${a.state}">${a.state}</span></div>`).join('');
    $('#list').querySelectorAll<HTMLElement>('.row').forEach((r) => (r.onclick = () => {
      const a = scene.agents.get(r.dataset.id!); if (!a) return;
      scene.select(a); scene.cameras.main.pan(a.sprite.x, a.sprite.y, 400);
    }));
    $('#doing').innerHTML = agents.filter((a) => a.task).map((a) =>
      `<div>${esc(a.task!)} — <i>${esc(a.form.name)}</i> ${Math.round(a.progress * 100)}%</div>`).join('');
    for (const a of agents) {
      const last = a.log[a.log.length - 1];
      if (last !== lastLogLen.get(a.id) && /^(Done|Failed)/.test(last)) done.unshift(`${last} — ${a.form.name}`);
      lastLogLen.set(a.id, last);
    }
    done.length = Math.min(done.length, 20);
    $('#done').innerHTML = done.map((d) => `<div>${esc(d)}</div>`).join('');
  }

  function showAgent(a: Agent | null) {
    const el = $('#right');
    el.hidden = !a;
    if (!a) return refresh();
    const next = a.nextForm();
    const forms = allForms();
    el.innerHTML = `
      <h3>${esc(a.name)}</h3>
      <div><b>${esc(a.form.name)}</b> · ${a.form.stage} (${SENIORITY[a.form.stage]})</div>
      <div>role: <select id="a-role">${ROLES.map((r) => `<option ${r === a.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div>state: <span class="st ${a.state}">${a.state}</span></div>
      <div>XP ${a.xp}/${Number.isFinite(a.xpNeeded) ? a.xpNeeded : '—'} · tasks ${a.completed} · errors ${a.errors}</div>
      <div class="xp"><i style="width:${Math.min(100, (a.xp / a.xpNeeded) * 100) || 0}%"></i></div>
      ${a.task ? `<div>task: ${esc(a.task)} (${Math.round(a.progress * 100)}%)</div>` : ''}
      <button id="a-dex">Pick ${esc(a.form.name)} sprite (Digidex)</button>
      <button id="a-evo" ${next ? '' : 'disabled'}>Digivolve${next ? ` → ${esc(next.name)}` : ''}</button>
      <div>change Digimon:
        <select id="a-form">${forms.map(({ form, line }) =>
          `<option value="${line.id}|${form.id}" ${form === a.form ? 'selected' : ''}>${esc(form.name)}</option>`).join('')}</select></div>
      <input id="a-task" placeholder="new task title"><button id="a-assign">Assign task</button>
      <button id="a-fire">Fire</button>
      <div class="log">${a.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
    $<HTMLSelectElement>('#a-role').onchange = (e) => { a.role = (e.target as HTMLSelectElement).value as Role; };
    $('#a-evo').onclick = () => a.evolve();
    $('#a-dex').onclick = () => openDex(`PICK SPRITE FOR ${a.form.name.toUpperCase()}`, a.form.id, (s) => {
      setSpriteFor(a.form.id, s.id); reskin(a.form.id);
    });
    $<HTMLSelectElement>('#a-form').onchange = (e) => {
      const [lineId, formId] = (e.target as HTMLSelectElement).value.split('|');
      a.line = lineById(lineId);
      a.evolve(allForms().find((f) => f.form.id === formId)!.form);
    };
    $('#a-assign').onclick = () => {
      const t = $<HTMLInputElement>('#a-task').value.trim();
      if (!t) return;
      if (scene.source.isBusy(a.id)) return alert(`${a.name} is busy`);
      scene.source.assign(a.id, t);
    };
    $('#a-fire').onclick = () => scene.fire(a.id);
    refresh();
  }

  // ---- Digidex: pick a Dusk sprite for a form, or hire one directly ----
  let dexPick: ((s: SpriteInfo) => void) | null = null;
  let dexForm: string | null = null;
  function openDex(title: string, formId: string | null, pick: (s: SpriteInfo) => void) {
    dexPick = pick; dexForm = formId;
    $('#dex-title').textContent = title;
    $('#dex-reset').hidden = !formId;
    $('#dex').hidden = false;
    drawDex();
  }
  function drawDex() {
    const q = $<HTMLInputElement>('#dex-q').value.trim().replace('#', '');
    const cur = dexForm ? spriteFor(dexForm).id : '';
    const list = allSprites().filter((s) => !q || s.id.includes(q) || String(s.frame[0]) === q || String(s.frame[1]) === q);
    $('#dex-grid').innerHTML = list.length ? list.map((s) => {
      const z = s.frame[1] > 32 ? 1 : 2;
      return `<div class="dx ${s.id === cur ? 'cur' : ''}" data-id="${s.id}"><i style="width:${s.frame[0] * z}px;height:${s.frame[1] * z}px;
        background-image:url(${s.url});background-size:auto ${s.frame[1] * z}px;background-position:-${s.thumb * s.frame[0] * z}px 0"></i>
        <span>#${s.id.replace(/^\D+_/, '')}</span></div>`;
    }).join('') : '<p>No sprite packs loaded. Run <code>npm run import-dusk -- &lt;overworld dir&gt;</code>.</p>';
    $('#dex-grid').querySelectorAll<HTMLElement>('.dx').forEach((el) => (el.onclick = () => {
      const s = allSprites().find((x) => x.id === el.dataset.id);
      if (s && dexPick) dexPick(s);
      $('#dex').hidden = true;
    }));
  }
  $('#dex-q').oninput = drawDex;
  $('#dex-close').onclick = () => { $('#dex').hidden = true; };
  $('#dex-reset').onclick = () => {
    if (!dexForm) return;
    setSpriteFor(dexForm, null); reskin(dexForm); $('#dex').hidden = true;
  };
  $('#dex-export').onclick = () => {
    const blob = new Blob([JSON.stringify(currentMapping(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dusk-map.json'; a.click();
  };
  const reskin = (formId: string) => {
    for (const a of scene.agents.values()) if (a.form.id === formId) a.applyForm();
    if (scene.selected) showAgent(scene.selected);
  };
  $('#h-dex').onclick = () => openDex('HIRE FROM DIGIDEX', null, (s) => {
    const name = `#${s.id.replace(/^\D+_/, '')}`;
    const line = addCustomLine(name);
    setSpriteFor(line.forms[0].id, s.id);
    const a = scene.hire(line.id, undefined, $<HTMLSelectElement>('#h-role').value as Role,
      $<HTMLInputElement>('#h-name').value || undefined);
    if (!a) alert('No free desks!'); else scene.select(a);
  });

  scene.onAgentsChanged = refresh;
  scene.onSelect = (a) => {
    // Don't rebuild the panel while the user is typing a task.
    if (a && document.activeElement?.id === 'a-task') return refresh();
    showAgent(a);
  };
  refresh();
}
