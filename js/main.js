// main.js — 진입점. 화면 라우팅, 메뉴/설정/플레이 설정/리플레이 목록/온라인 로비, SW 등록.
import * as ui from './ui.js';
import * as ctrl from './controller.js';
import * as replay from './replay.js';
import * as store from './storage.js';
import * as sound from './sound.js';
import { logoSVG } from './art.js';
import { PET_KEYS_DESC, PET_BY_KEY } from './cards.js';
import { multiplayerEnabled } from './firebase-config.js';

const AI_NAMES = ['몽이', '코코', '보리', '나비', '두부', '콩이'];
let settings = store.loadSettings();
let online = null; // { code, unsub, isHost }

document.addEventListener('DOMContentLoaded', init);

function init() {
  ui.setAnimations(settings.animations !== false);
  sound.setBGM(settings.bgm !== false);
  sound.setSFX(settings.sfx !== false);
  // 로고
  const logo = ui.$('#logo'); if (logo) logo.innerHTML = logoSVG();
  buildHowTo();

  // 메뉴 버튼
  bind('#menu-play', () => { ui.showScreen('screen-setup'); renderSetup(); });
  bind('#menu-replay', () => { ui.showScreen('screen-replays'); renderReplays(); });
  bind('#menu-settings', () => { ui.showScreen('screen-settings'); renderSettings(); });
  bind('#menu-online', openOnline);
  if (!multiplayerEnabled) { const b = ui.$('#menu-online'); if (b) b.style.display = 'none'; }

  // 공통 뒤로가기
  ui.$$('[data-back]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.back === 'leaveOnline') { ctrl.leaveOnline(); leaveLobby(); }
    if (b.dataset.back === 'replay') replay.closeReplay();
    ui.showScreen('screen-menu');
  }));

  // 결과 화면 버튼
  bind('#result-rematch', () => ctrl.rematch());
  bind('#result-menu', () => ui.showScreen('screen-menu'));
  bind('#result-replay', () => { ui.showScreen('screen-replays'); renderReplays(); });
  bind('#game-menu', () => { if (confirm('게임을 나가고 메뉴로 갈까요?')) { ctrl.leaveOnline(); ui.showScreen('screen-menu'); } });

  registerSW();
}

function bind(sel, fn) { const el = ui.$(sel); if (el) el.addEventListener('click', fn); }

// ── 플레이 설정 ──────────────────────────────────────────
let setup = { total: 2, ai: 1, difficulty: settings.difficulty || 'normal' };
function renderSetup() {
  setup.difficulty = settings.difficulty || 'normal';
  const box = ui.$('#setup-body');
  box.innerHTML = `
    <label class="field"><span>플레이 인원</span>
      <div class="seg" id="seg-total">${[2, 3, 4].map((n) => `<button data-v="${n}">${n}명</button>`).join('')}</div></label>
    <label class="field"><span>AI 수</span><div class="seg" id="seg-ai"></div></label>
    <label class="field"><span>AI 난이도</span>
      <div class="seg" id="seg-diff">
        <button data-v="easy">쉬움</button><button data-v="normal">보통</button><button data-v="hard">어려움</button></div></label>
    <p class="setup-note" id="setup-note"></p>
    <button class="btn primary big" id="setup-start">🐾 게임 시작</button>`;
  segWire('#seg-total', setup.total, (v) => { setup.total = v; if (setup.ai > v - 1) setup.ai = v - 1; renderAiSeg(); updateNote(); });
  segWire('#seg-diff', setup.difficulty, (v) => { setup.difficulty = v; });
  renderAiSeg();
  updateNote();
  ui.$('#setup-start').onclick = startLocalGame;

  function renderAiSeg() {
    const seg = ui.$('#seg-ai');
    const max = setup.total - 1; // 최소 1명은 사람
    let opts = [];
    for (let i = 0; i <= max; i++) opts.push(i);
    seg.innerHTML = opts.map((n) => `<button data-v="${n}">${n}</button>`).join('');
    if (setup.ai > max) setup.ai = max;
    segWire('#seg-ai', setup.ai, (v) => { setup.ai = v; updateNote(); });
  }
  function updateNote() {
    const humans = setup.total - setup.ai;
    ui.$('#setup-note').textContent = humans > 1
      ? `🧑 사람 ${humans}명(같은 기기 핫시트) + 🤖 AI ${setup.ai}명`
      : `🧑 사람 1명 + 🤖 AI ${setup.ai}명`;
  }
}

function segWire(sel, current, onPick) {
  const seg = ui.$(sel);
  seg.querySelectorAll('button').forEach((b) => {
    const v = isNaN(Number(b.dataset.v)) ? b.dataset.v : Number(b.dataset.v);
    b.classList.toggle('active', v === current);
    b.onclick = () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      onPick(v);
    };
  });
}

function startLocalGame() {
  const humans = setup.total - setup.ai;
  const configs = [];
  for (let i = 0; i < humans; i++) configs.push({ name: humans > 1 ? `${settings.playerName} ${i + 1}` : settings.playerName, isAI: false });
  for (let i = 0; i < setup.ai; i++) configs.push({ name: AI_NAMES[i % AI_NAMES.length], isAI: true, difficulty: setup.difficulty });
  ctrl.startLocal(configs);
}

// ── 리플레이 목록 ────────────────────────────────────────
function renderReplays() {
  const list = store.loadReplays();
  const box = ui.$('#replays-body');
  if (!list.length) {
    box.innerHTML = `<p class="empty">아직 저장된 게임이 없어요.<br>게임을 한 판 즐기면 여기에 기록돼요! 🐾</p>`;
  } else {
    box.innerHTML = list.map((r) => {
      const winners = Array.isArray(r.winner) ? r.winner : [r.winner];
      const wname = winners.map((i) => r.configs[i]?.name).join(', ');
      const d = new Date(r.date);
      return `<div class="replay-item" data-id="${r.id}">
        <div class="ri-main">
          <div class="ri-title">🏆 ${wname} ${r.online ? '🌐' : ''} ${r.imported ? '📥' : ''}</div>
          <div class="ri-sub">${r.configs.length}명 · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)} · ${r.scores.join('-')}쓰담</div>
        </div>
        <div class="ri-actions">
          <button class="btn tiny" data-act="watch">▶ 보기</button>
          <button class="btn tiny ghost" data-act="export">⬇</button>
          <button class="btn tiny ghost" data-act="del">🗑</button>
        </div></div>`;
    }).join('');
    box.onclick = (e) => {
      const item = e.target.closest('.replay-item'); if (!item) return;
      const id = item.dataset.id;
      const rec = store.loadReplays().find((r) => r.id === id);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!rec) return;
      if (act === 'watch') replay.openReplay(rec);
      else if (act === 'export') store.exportReplay(rec);
      else if (act === 'del') { if (confirm('이 기록을 삭제할까요?')) renderReplays(store.deleteReplay(id)); }
      else replay.openReplay(rec);
    };
  }
  // 불러오기 버튼
  const imp = ui.$('#replay-import');
  if (imp) imp.onclick = () => ui.$('#replay-file').click();
  const file = ui.$('#replay-file');
  if (file) file.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rec = await store.importReplayFile(f);
      store.addReplay(rec);
      ui.toast('📥 리플레이를 불러왔어요');
      renderReplays();
    } catch (err) { ui.toast('⚠️ ' + err.message); }
    e.target.value = '';
  };
}

// ── 설정 ─────────────────────────────────────────────────
function renderSettings() {
  const box = ui.$('#settings-body');
  box.innerHTML = `
    <label class="field"><span>닉네임</span>
      <input id="set-name" class="text-in" maxlength="10" value="${escapeHtml(settings.playerName)}"></label>
    <label class="field row"><span>애니메이션</span>
      <input type="checkbox" id="set-anim" ${settings.animations !== false ? 'checked' : ''}></label>
    <label class="field row"><span>배경음 (BGM)</span>
      <input type="checkbox" id="set-bgm" ${settings.bgm !== false ? 'checked' : ''}></label>
    <label class="field row"><span>효과음 (SFX)</span>
      <input type="checkbox" id="set-sfx" ${settings.sfx !== false ? 'checked' : ''}></label>
    <label class="field"><span>기본 AI 난이도</span>
      <div class="seg" id="set-diff">
        <button data-v="easy">쉬움</button><button data-v="normal">보통</button><button data-v="hard">어려움</button></div></label>
    <button class="btn primary" id="set-save">저장</button>`;
  segWire('#set-diff', settings.difficulty || 'normal', (v) => { settings.difficulty = v; });
  ui.$('#set-save').onclick = () => {
    settings.playerName = (ui.$('#set-name').value || '집사').trim();
    settings.animations = ui.$('#set-anim').checked;
    settings.bgm = ui.$('#set-bgm').checked;
    settings.sfx = ui.$('#set-sfx').checked;
    store.saveSettings(settings);
    ui.setAnimations(settings.animations);
    sound.setBGM(settings.bgm);
    sound.setSFX(settings.sfx);
    ui.toast('💾 저장했어요');
    ui.showScreen('screen-menu');
  };
}

// ── 온라인 로비 ──────────────────────────────────────────
function openOnline() {
  ui.showScreen('screen-online');
  const box = ui.$('#online-body');
  box.innerHTML = `
    <div class="online-card">
      <h3>방 만들기</h3><p>새 방을 만들고 코드를 친구에게 공유하세요.</p>
      <button class="btn primary" id="ol-create">방 만들기</button>
    </div>
    <div class="online-card">
      <h3>방 참가하기</h3>
      <input id="ol-code" class="text-in" placeholder="방 코드 (예: AB12CD)" maxlength="6" style="text-transform:uppercase">
      <button class="btn" id="ol-join">참가하기</button>
    </div>
    <div id="lobby"></div>`;
  ui.$('#ol-create').onclick = createRoom;
  ui.$('#ol-join').onclick = joinRoom;
}

async function withNet(fn) {
  try { const net = await import('./firebase.js'); return await fn(net); }
  catch (e) { ui.toast('⚠️ 네트워크 오류: ' + (e.message || e)); throw e; }
}

async function createRoom() {
  await withNet(async (net) => {
    const code = await net.createRoom(settings.playerName);
    enterLobby(net, code, true);
  });
}
async function joinRoom() {
  const code = (ui.$('#ol-code').value || '').trim().toUpperCase();
  if (code.length !== 6) return ui.toast('6자리 방 코드를 입력하세요');
  await withNet(async (net) => {
    await net.joinRoom(code, settings.playerName);
    enterLobby(net, code, false);
  });
}

async function enterLobby(net, code, isHost) {
  online = { code, isHost, unsub: null };
  online.unsub = await net.subscribe(code, (data) => {
    if (!online) return;
    if (data.status === 'playing') {
      leaveLobby();
      ctrl.startOnline(code, data);
      return;
    }
    renderLobby(data, net);
  });
}

function renderLobby(data, net) {
  const lobby = ui.$('#lobby');
  if (!lobby) return;
  const isHost = data.hostId === net.clientId();
  lobby.innerHTML = `
    <div class="online-card lobby">
      <h3>방 코드</h3><div class="room-code">${data.code}</div>
      <button class="btn tiny ghost" id="ol-copy">코드 복사</button>
      <h4>참가자 (${data.players.length}/4)</h4>
      <ul class="lobby-players">${data.players.map((p) => `<li>🧑 ${escapeHtml(p.name)}${p.uid === data.hostId ? ' 👑' : ''}</li>`).join('')}</ul>
      ${isHost ? `<button class="btn primary" id="ol-start" ${data.players.length < 2 ? 'disabled' : ''}>게임 시작 (${data.players.length}명)</button>`
        : `<p class="waiting">방장이 시작하기를 기다리는 중… 🐾</p>`}
    </div>`;
  ui.$('#ol-copy').onclick = () => { navigator.clipboard?.writeText(data.code); ui.toast('📋 코드 복사됨'); };
  const start = ui.$('#ol-start');
  if (start) start.onclick = () => net.startGame(data.code).catch((e) => ui.toast('⚠️ ' + e.message));
}

function leaveLobby() {
  if (online && online.unsub) online.unsub();
  online = null;
}

// ── 게임 방법 안내 카드 ──────────────────────────────────
function buildHowTo() {
  const el = ui.$('#how-pets');
  if (!el) return;
  el.innerHTML = PET_KEYS_DESC.map((k) => {
    const p = PET_BY_KEY[k];
    return `<span class="hp" style="--c:${p.color}"><b>${p.rank}</b> ${p.name}</span>`;
  }).join('');
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ── 서비스워커 ───────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}
