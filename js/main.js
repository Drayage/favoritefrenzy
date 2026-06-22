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
  bind('#menu-rules', () => { ui.showScreen('screen-rules'); renderRules(); });
  bind('#menu-online', openOnline);
  if (!multiplayerEnabled) { const b = ui.$('#menu-online'); if (b) b.style.display = 'none'; }

  // 이어하기 버튼
  updateResumeBtn();
  bind('#menu-resume', resumeSession);

  // 공통 뒤로가기
  ui.$$('[data-back]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.back === 'leaveOnline') { ctrl.leaveOnline(); leaveLobby(); }
    if (b.dataset.back === 'replay') replay.closeReplay();
    ui.showScreen('screen-menu');
    updateResumeBtn();
  }));

  // 결과 화면 버튼
  bind('#result-rematch', () => ctrl.rematch());
  bind('#result-menu', () => { ui.showScreen('screen-menu'); updateResumeBtn(); });
  bind('#result-replay', () => { ui.showScreen('screen-replays'); renderReplays(); });
  bind('#game-menu', () => {
    if (confirm('게임을 나가고 메뉴로 갈까요?')) {
      ctrl.leaveOnline();
      ui.showScreen('screen-menu');
      updateResumeBtn();
    }
  });

  registerSW();
}

function updateResumeBtn() {
  const btn = ui.$('#menu-resume');
  if (!btn) return;
  btn.style.display = sessionStorage.getItem('ff_session') ? '' : 'none';
}

async function resumeSession() {
  const raw = sessionStorage.getItem('ff_session');
  if (!raw) return;
  let record;
  try { record = JSON.parse(raw); } catch { ctrl.clearSession(); updateResumeBtn(); return; }

  if (record.mode === 'local') {
    ctrl.resumeLocalGame(record);
  } else if (record.mode === 'online') {
    if (!multiplayerEnabled) { ctrl.clearSession(); updateResumeBtn(); return; }
    ui.toast('⌛ 재접속 중…');
    await withNet(async (net) => {
      await enterLobby(net, record.code, false);
    });
  }
}

function bind(sel, fn) { const el = ui.$(sel); if (el) el.addEventListener('click', fn); }

// ── 플레이 설정 ──────────────────────────────────────────
let setup = { total: 2, ai: 1, difficulty: settings.difficulty || 'normal', petsPerType: 8, specialCount: 1, teamMode: false };
function renderSetup() {
  setup.difficulty = settings.difficulty || 'normal';
  setup.petsPerType = 8;
  setup.specialCount = 1;
  setup.teamMode = false;
  const box = ui.$('#setup-body');
  box.innerHTML = `
    <label class="field"><span>플레이 인원</span>
      <div class="seg" id="seg-total">${[2, 3, 4].map((n) => `<button data-v="${n}">${n}명</button>`).join('')}</div></label>
    <label class="field"><span>AI 수</span><div class="seg" id="seg-ai"></div></label>
    <label class="field"><span>AI 난이도</span>
      <div class="seg" id="seg-diff">
        <button data-v="easy">쉬움</button><button data-v="normal">보통</button><button data-v="hard">어려움</button></div></label>
    <label class="field row" id="team-toggle-wrap" style="display:none">
      <span>🆚 2v2 팀전 모드</span>
      <input type="checkbox" id="team-toggle">
    </label>
    <label class="field slider-field">
      <span>동물당 카드 수: <b id="val-pets">8</b>장</span>
      <input type="range" id="sl-pets" min="6" max="12" value="8">
    </label>
    <label class="field slider-field">
      <span>특수카드 수 (타입당): <b id="val-spec">1</b>장</span>
      <input type="range" id="sl-spec" min="0" max="4" value="1">
    </label>
    <p class="setup-note" id="setup-note"></p>
    <button class="btn primary big" id="setup-start">🐾 게임 시작</button>`;
  segWire('#seg-total', setup.total, (v) => {
    setup.total = v;
    if (v !== 4) { setup.teamMode = false; const tc = ui.$('#team-toggle'); if (tc) tc.checked = false; }
    if (setup.ai > v - 1) setup.ai = v - 1;
    renderAiSeg(); updateNote(); updateTeamToggle();
  });
  segWire('#seg-diff', setup.difficulty, (v) => { setup.difficulty = v; });
  renderAiSeg();
  updateNote();
  updateTeamToggle();
  ui.$('#team-toggle').addEventListener('change', (e) => { setup.teamMode = e.target.checked; updateNote(); });
  const slPets = ui.$('#sl-pets');
  slPets.addEventListener('input', () => { setup.petsPerType = +slPets.value; ui.$('#val-pets').textContent = slPets.value; });
  const slSpec = ui.$('#sl-spec');
  slSpec.addEventListener('input', () => { setup.specialCount = +slSpec.value; ui.$('#val-spec').textContent = slSpec.value; });
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
  function updateTeamToggle() {
    const wrap = ui.$('#team-toggle-wrap');
    if (wrap) wrap.style.display = setup.total === 4 ? '' : 'none';
  }
  function updateNote() {
    const humans = setup.total - setup.ai;
    let note = humans > 1
      ? `🧑 사람 ${humans}명(같은 기기 핫시트) + 🤖 AI ${setup.ai}명`
      : `🧑 사람 1명 + 🤖 AI ${setup.ai}명`;
    if (setup.teamMode) note += ' · 🆚 팀A(1·3번) vs 팀B(2·4번)';
    ui.$('#setup-note').textContent = note;
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
  for (let i = 0; i < humans; i++) {
    configs.push({ name: humans > 1 ? `${settings.playerName} ${i + 1}` : settings.playerName, isAI: false, team: setup.teamMode ? i % 2 : undefined });
  }
  for (let i = 0; i < setup.ai; i++) {
    configs.push({ name: AI_NAMES[i % AI_NAMES.length], isAI: true, difficulty: setup.difficulty, team: setup.teamMode ? (humans + i) % 2 : undefined });
  }
  ctrl.startLocal(configs, { petsPerType: setup.petsPerType, specialCount: setup.specialCount });
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
  ui.showScreen('screen-online');
  online.unsub = await net.subscribe(code, (data) => {
    if (!online) return;
    if (data.status === 'playing') {
      leaveLobby();
      ctrl.startOnline(code, data);
      return;
    }
    if (data.status === 'ended') {
      leaveLobby();
      ctrl.clearSession();
      ui.toast('게임이 이미 종료됐어요');
      ui.showScreen('screen-menu');
      updateResumeBtn();
      return;
    }
    renderLobby(data, net);
  });
}

function renderLobby(data, net) {
  const lobby = ui.$('#lobby');
  if (!lobby) return;
  const myUid = net.clientId();
  const isHost = data.hostId === myUid;
  const opts = data.opts || {};

  const playersList = data.players.map((p) =>
    `<li>${p.isAI ? '🤖' : '🧑'} ${escapeHtml(p.name)}${p.uid === data.hostId ? ' 👑' : ''}${isHost && p.isAI ? ` <button class="btn tiny ghost rmv-ai" data-uid="${p.uid}">✕</button>` : ''}</li>`
  ).join('');

  const hostControls = isHost ? `
    ${data.players.length < 4 ? `<div class="lobby-ai-row">
      <div class="seg" id="lobby-ai-diff">
        <button data-v="easy">쉬움</button><button data-v="normal" class="active">보통</button><button data-v="hard">어려움</button>
      </div>
      <button class="btn tiny" id="lobby-ai-add">+ AI</button>
    </div>` : ''}
    <label class="field slider-field">
      <span>동물당 카드 수: <b id="lv-pets">${opts.petsPerType || 8}</b>장</span>
      <input type="range" id="ls-pets" min="6" max="12" value="${opts.petsPerType || 8}">
    </label>
    <label class="field slider-field">
      <span>특수카드 수 (타입당): <b id="lv-spec">${opts.specialCount ?? 1}</b>장</span>
      <input type="range" id="ls-spec" min="0" max="4" value="${opts.specialCount ?? 1}">
    </label>
    <button class="btn primary" id="ol-start" ${data.players.length < 2 ? 'disabled' : ''}>게임 시작 (${data.players.length}명)</button>
  ` : `<p class="waiting">방장이 시작하기를 기다리는 중… 🐾</p>`;

  lobby.innerHTML = `
    <div class="online-card lobby">
      <h3>방 코드</h3><div class="room-code">${data.code}</div>
      <button class="btn tiny ghost" id="ol-copy">코드 복사</button>
      <h4>참가자 (${data.players.length}/4)</h4>
      <ul class="lobby-players">${playersList}</ul>
      ${hostControls}
    </div>`;

  ui.$('#ol-copy').onclick = () => { navigator.clipboard?.writeText(data.code); ui.toast('📋 코드 복사됨'); };

  if (isHost) {
    // AI 난이도 선택
    let aiDiff = 'normal';
    const diffSeg = ui.$('#lobby-ai-diff');
    if (diffSeg) {
      diffSeg.querySelectorAll('button').forEach((b) => {
        b.onclick = () => { diffSeg.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); aiDiff = b.dataset.v; };
      });
    }

    // AI 추가
    const addBtn = ui.$('#lobby-ai-add');
    if (addBtn) {
      addBtn.onclick = () => {
        const aiNames = ['몽이', '코코', '보리', '나비', '두부', '콩이'];
        const aiCount = data.players.filter((p) => p.isAI).length;
        net.addAIPlayer(data.code, aiNames[aiCount % aiNames.length], aiDiff).catch((e) => ui.toast('⚠️ ' + e.message));
      };
    }

    // AI 제거
    lobby.querySelectorAll('.rmv-ai').forEach((btn) => {
      btn.onclick = () => net.removeAIPlayer(data.code, btn.dataset.uid).catch((e) => ui.toast('⚠️ ' + e.message));
    });

    // 카드 설정 슬라이더
    const slPets = ui.$('#ls-pets');
    if (slPets) slPets.addEventListener('change', () => {
      ui.$('#lv-pets').textContent = slPets.value;
      net.updateRoomOpts(data.code, { ...opts, petsPerType: +slPets.value }).catch(() => {});
    });
    const slSpec = ui.$('#ls-spec');
    if (slSpec) slSpec.addEventListener('change', () => {
      ui.$('#lv-spec').textContent = slSpec.value;
      net.updateRoomOpts(data.code, { ...opts, specialCount: +slSpec.value }).catch(() => {});
    });
    // 드래그 중 레이블 실시간 업데이트
    if (slPets) slPets.addEventListener('input', () => ui.$('#lv-pets').textContent = slPets.value);
    if (slSpec) slSpec.addEventListener('input', () => ui.$('#lv-spec').textContent = slSpec.value);

    // 게임 시작
    const start = ui.$('#ol-start');
    if (start) {
      start.onclick = () => {
        const currentOpts = { petsPerType: slPets ? +slPets.value : (opts.petsPerType || 8), specialCount: slSpec ? +slSpec.value : (opts.specialCount ?? 1) };
        net.startGame(data.code, currentOpts).catch((e) => ui.toast('⚠️ ' + e.message));
      };
    }
  }
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

// ── 게임 방법 (룰 화면) ──────────────────────────────────
function renderRules() {
  const box = ui.$('#rules-body');
  const petRanks = PET_KEYS_DESC.map((k) => {
    const p = PET_BY_KEY[k];
    return `<span class="hp" style="--c:${p.color}"><b>${p.rank}</b> ${p.name}</span>`;
  }).join('');
  box.innerHTML = `
    <div class="rule-section">
      <h3 class="rule-h">🎯 목표</h3>
      <p>턴마다 카드를 내어 <b>관심 폭발</b>을 일으키고, 상대 펫을 밀어내 💗<b>쓰담</b>을 가장 많이 모으세요!</p>
    </div>

    <div class="rule-section">
      <h3 class="rule-h">🔄 한 턴의 흐름</h3>
      <ol class="rule-ol">
        <li>손패(5장)에서 <b>같은 펫 카드 1~3장</b> 또는 <b>특수카드 1장</b>을 선택해 내기</li>
        <li>내기 후 덱에서 보충해 5장 유지 (덱 소진 시 보충 없음)</li>
        <li>다음 플레이어로 턴 이동</li>
      </ol>
    </div>

    <div class="rule-section">
      <h3 class="rule-h">💥 관심 폭발</h3>
      <p>같은 펫 카드가 보드의 해당 존에 <b>3장</b> 쌓이면 <b>관심 폭발</b>!</p>
      <ul class="rule-ul">
        <li>자신보다 <b>낮은 순위</b>의 펫 존 중 카드가 있는 가장 높은 곳을 <b>밀어냄</b></li>
        <li>밀려난 존의 카드 수만큼 💗<b>쓰담 획득</b></li>
        <li>밀어낼 상대가 없으면 폭발 실패 (점수 없음)</li>
      </ul>
    </div>

    <div class="rule-section">
      <h3 class="rule-h">🐾 펫 순위 (높을수록 강함)</h3>
      <div class="how-pets rule-ranks">${petRanks}</div>
      <p class="rule-note">😼 <b>고슴도치(1위)</b>는 예외적으로 최강 <b>고양이(8위)</b>를 밀어낼 수 있어요!</p>
    </div>

    <div class="rule-section">
      <h3 class="rule-h">🃏 특수카드</h3>
      <ul class="rule-special">
        <li><span class="rs-emoji">🦎</span><span><b>카멜레온</b> — 원하는 펫으로 변신. 같은 펫 3장 합산에 사용 가능</span></li>
        <li><span class="rs-emoji">🧸</span><span><b>장난감</b> — 선택한 존의 카드를 전부 제거</span></li>
        <li><span class="rs-emoji">🎪</span><span><b>장난꾸러기</b> — 상대를 지정해 손패 전부 교환</span></li>
        <li><span class="rs-emoji">🛏️</span><span><b>침대 아래</b> — 원하는 존에 배치. 다음 밀어내기 1회 방어 (+1쓰담)</span></li>
        <li><span class="rs-emoji">🎀</span><span><b>최애리본</b> — 펫을 지정. 그 펫이 밀려날 때마다 +1쓰담 추가</span></li>
      </ul>
    </div>

    <div class="rule-section">
      <h3 class="rule-h">🏁 게임 종료</h3>
      <p>덱이 소진된 후 어느 플레이어의 손패가 <b>0장</b>이 되면 게임 종료!</p>
      <p>가장 많은 💗쓰담을 모은 플레이어가 오늘의 <b>쓰담왕</b> 🏆</p>
    </div>`;
}

// ── 서비스워커 ───────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.update(); // 방문 시 새 버전 능동 확인
    } catch {}
  });
  // 새 SW가 제어권을 잡으면 1회만 새로고침해 최신 자산 반영 (무한 루프 방지 가드)
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
