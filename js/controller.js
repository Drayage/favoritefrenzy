// controller.js — 게임 진행 오케스트레이션 (로컬 AI/핫시트 + 온라인).
import { createGame, reconstruct, applyAction, candidateActions, score, previewPlayPets } from './engine.js';
import { chooseAction } from './ai.js';
import { getCard, PET_BY_KEY, SPECIALS } from './cards.js';
import { randomSeed } from './rng.js';
import * as ui from './ui.js';
import { saveReplay } from './storage.js';
import * as net from './firebase.js';
import * as sound from './sound.js';

let G = null; // 현재 세션

// ── 세션 저장/복구 ───────────────────────────────────────
function saveSession() {
  if (!G) return;
  if (G.mode === 'local') {
    sessionStorage.setItem('ff_session', JSON.stringify({
      mode: 'local', seed: G.seed, configs: G.configs,
      opts: G.opts || {}, log: G.state.log, viewer: G.viewer,
    }));
  } else if (G.mode === 'online') {
    sessionStorage.setItem('ff_session', JSON.stringify({ mode: 'online', code: G.code }));
  }
}
export function clearSession() { sessionStorage.removeItem('ff_session'); }

// ── 로컬 게임 시작 ────────────────────────────────────────
export function startLocal(configs, opts = {}) {
  sound.initAudio();
  const seed = randomSeed();
  const state = createGame(configs, seed, opts);
  G = {
    mode: 'local', state, configs, seed, opts,
    humanIndexes: configs.map((c, i) => (c.isAI ? -1 : i)).filter((i) => i >= 0),
    viewer: 0, selected: new Set(), busy: false, saved: false,
  };
  G.viewer = G.humanIndexes[0] ?? 0;
  ui.showScreen('screen-game');
  wireHand();
  runLocal();
}

// ── 로컬 게임 복구 (새로고침 후 세션 복원) ───────────────
export function resumeLocalGame(record) {
  sound.initAudio();
  const { configs, seed, opts, log, viewer } = record;
  const state = createGame(configs, seed, opts || {});
  for (const action of log) applyAction(state, action);
  if (state.phase === 'ended') {
    clearSession();
    G = { mode: 'local', state, configs, seed, opts: opts || {}, humanIndexes: [], viewer: viewer ?? 0, selected: new Set(), busy: false, saved: true };
    showResult(state);
    return;
  }
  G = {
    mode: 'local', state, configs, seed, opts: opts || {},
    humanIndexes: configs.map((c, i) => (c.isAI ? -1 : i)).filter((i) => i >= 0),
    viewer: viewer ?? 0, selected: new Set(), busy: false, saved: false,
  };
  ui.showScreen('screen-game');
  wireHand();
  runLocal();
}

function multiHuman() { return G.humanIndexes.length > 1; }

async function runLocal() {
  const { state } = G;
  while (state.phase === 'playing') {
    const cur = state.players[state.current];
    if (cur.isAI) {
      await aiTurn();
    } else {
      if (multiHuman() && G.viewer !== cur.index) {
        await handoff(cur);
      }
      G.viewer = cur.index;
      G.selected.clear();
      ui.renderAll(state, G.viewer, { selectable: true, selected: G.selected });
      renderActionBar();
      return; // 사람 입력 대기
    }
  }
  finishGame();
}

async function aiTurn() {
  const { state } = G;
  G.busy = true;
  ui.renderAll(state, G.viewer, { selectable: false });
  renderActionBar();
  await delay(550);
  const action = chooseAction(state, state.players[state.current].difficulty);
  const events = applyAction(state, action);
  saveSession();
  ui.renderAll(state, G.viewer, { selectable: false });
  await ui.animate(events, state, G.viewer);
  G.busy = false;
}

// 핫시트 핸드오프 오버레이
function handoff(player) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal handoff"><h3>🔄 차례 변경</h3>
      <p><b>${player.name}</b>님의 차례예요.<br>다른 사람에게 보이지 않게 기기를 건네주세요.</p>
      <button class="btn primary" data-go>내 차례 시작</button></div>`;
    document.body.appendChild(back);
    back.querySelector('[data-go]').addEventListener('click', () => { back.remove(); resolve(); });
  });
}

// ── 사람 입력 처리 ───────────────────────────────────────
function wireHand() {
  const hand = ui.$('#hand');
  hand.onclick = (e) => {
    if (G.busy) return;
    const cur = G.state.players[G.state.current];
    if (cur.isAI || cur.index !== G.viewer) return;
    const cardDiv = e.target.closest('.card');
    if (!cardDiv) return;
    onCardTap(Number(cardDiv.dataset.id));
  };
}

async function onCardTap(id) {
  const c = getCard(id);
  const sel = G.selected;

  if (c.type === 'special') {
    if (c.special === 'transform') {
      // 카멜레온: 선택 흐름 유지 + 토스트 안내
      ui.toast(`🦎 카멜레온 — ${SPECIALS.transform.desc}`);
      if (sel.has(id)) { sel.delete(id); }
      else {
        const selPet = currentSelectedPet();
        if (selPet) sel.clear(); // 펫이 이미 선택된 경우 초기화 후 변신왕 추가
        sel.add(id);
      }
      ui.renderHand(G.state, G.viewer, { selectable: true, selected: sel });
      renderActionBar();
    } else {
      // 기타 특수카드: 효과 확인 모달 먼저 표시
      sel.clear();
      ui.renderHand(G.state, G.viewer, { selectable: true, selected: sel });
      const go = await ui.specialInfoModal(SPECIALS[c.special]);
      if (!go) { renderActionBar(); return; }
      sound.sfxSpecial();
      handleSpecial(c.special);
    }
    return;
  }

  // 펫 카드: 다중 선택 (같은 펫 + 카멜레온만)
  if (sel.has(id)) { sel.delete(id); }
  else {
    const selPet = currentSelectedPet();
    if (selPet && c.type === 'pet' && selPet !== c.pet) sel.clear();
    sel.add(id);
  }
  ui.renderHand(G.state, G.viewer, { selectable: true, selected: sel });
  renderActionBar();
}

function currentSelectedPet() {
  for (const id of G.selected) { const c = getCard(id); if (c.type === 'pet') return c.pet; }
  return null;
}

function renderActionBar() {
  const bar = ui.$('#actions');
  bar.innerHTML = '';
  const { state } = G;
  if (state.phase !== 'playing') return;
  const cur = state.players[state.current];
  const myTurn = !cur.isAI && cur.index === G.viewer && !G.busy;

  if (!myTurn) {
    bar.innerHTML = '<span class="wait">상대의 차례를 기다리는 중…</span>';
  } else if (G.selected.size > 0) {
    const pet = currentSelectedPet();
    const label = pet ? PET_BY_KEY[pet].name : '펫 선택';
    bar.appendChild(button(`🐾 ${label} ${G.selected.size}장 내기`, 'primary', confirmPetPlay));
    bar.appendChild(button('선택 해제', 'ghost', () => {
      G.selected.clear();
      ui.renderHand(state, G.viewer, { selectable: true, selected: G.selected });
      renderActionBar();
    }));
    if (pet) {
      const preview = previewPlayPets(state, pet, [...G.selected]);
      const el = document.createElement('div');
      el.className = 'action-preview';
      el.textContent = preview;
      bar.appendChild(el);
    }
  } else {
    bar.appendChild(makeHint());
    if (candidateActions(state)[0]?.type === 'pass') {
      bar.appendChild(button('패스', 'ghost', () => submit({ type: 'pass' })));
    }
  }

  // 항복 버튼 (항상 표시)
  const b = button('🏳️ 항복', 'ghost tiny surrender-btn', surrender);
  bar.appendChild(b);
}

function makeHint() {
  const s = document.createElement('span');
  s.className = 'hint';
  s.textContent = '같은 펫 카드를 골라 내거나, 특수카드를 탭하세요';
  return s;
}

async function confirmPetPlay() {
  let pet = currentSelectedPet();
  if (!pet) {
    pet = await ui.pickPet('어떤 반려동물로 변신할까요?');
    if (!pet) return;
  }
  submit({ type: 'playPets', pet, cardIds: [...G.selected] });
}

async function handleSpecial(special) {
  const { state } = G;
  let action = null;
  if (special === 'toy') {
    const zone = await ui.pickZone(state, '🧸 어느 존의 카드를 전부 뺄까요?', { onlyNonEmpty: true });
    if (zone) action = { type: 'toy', zone };
  } else if (special === 'cushion') {
    const zone = await ui.pickZone(state, '🛏️ 어느 존을 방어할까요?', { onlyNonEmpty: true, noCushion: true });
    if (zone) action = { type: 'cushion', zone };
  } else if (special === 'badge') {
    const pet = await ui.pickPet('🎀 최애리본으로 인증할 반려동물은?');
    if (pet) action = { type: 'badge', pet };
  } else if (special === 'treat') {
    const target = await ui.pickPlayer(state, G.viewer, '🎪 누구와 손패를 교환할까요?');
    if (target == null || target === '') return;
    action = { type: 'treat', target: Number(target) };
  }
  if (action) submit(action);
}

// ── 액션 제출 (로컬/온라인 분기) ─────────────────────────
async function submit(action) {
  if (G.busy) return;
  if (G.mode === 'online') return submitOnline(action);
  G.busy = true;
  G.selected.clear();
  let events;
  try { events = applyAction(G.state, action); }
  catch (e) { ui.toast('⚠️ ' + e.message); G.busy = false; renderActionBar(); return; }
  saveSession();
  ui.renderAll(G.state, G.viewer, { selectable: false });
  await ui.animate(events, G.state, G.viewer);
  G.busy = false;
  runLocal();
}

// ── 항복 ─────────────────────────────────────────────────
export async function surrender() {
  if (!G || G.state.phase !== 'playing') return;
  if (!confirm('항복하고 게임을 끝낼까요?')) return;
  clearSession();
  if (G.mode === 'local') {
    const { state } = G;
    const scores = state.players.map((_, i) => score(state, i));
    const best = Math.max(...scores);
    const winners = scores.reduce((acc, s, i) => { if (s === best) acc.push(i); return acc; }, []);
    state.phase = 'ended';
    state.winner = winners.length === 1 ? winners[0] : winners;
    G.busy = false;
    finishGame();
  } else {
    if (G.unsub) G.unsub();
    net.leaveRoom(G.code).catch(() => {});
    G = null;
    ui.showScreen('screen-menu');
  }
}

// ── 종료/결과 ────────────────────────────────────────────
async function finishGame() {
  const { state } = G;
  clearSession();
  sound.sfxEnd();
  ui.renderAll(state, G.viewer, { selectable: false });
  ui.$('#actions').innerHTML = '';
  if (!G.saved) {
    G.saved = true;
    const record = {
      id: 'g_' + Date.now(),
      date: Date.now(),
      configs: state.configs,
      seed: state.seed,
      opts: state.opts || {},
      log: state.log,
      winner: state.winner,
      scores: state.players.map((_, i) => score(state, i)),
    };
    saveReplay(record);
  }
  const trigger = state.players.find((pl) => pl.hand.length === 0);
  if (trigger) await ui.showGameEnd(trigger.name);
  else await new Promise((r) => setTimeout(r, 700));
  showResult(state);
}

function showResult(state) {
  const winners = Array.isArray(state.winner) ? state.winner : [state.winner];
  const rows = state.players
    .map((p, i) => ({ p, s: score(state, i), win: winners.includes(i) }))
    .sort((a, b) => b.s - a.s)
    .map((r, idx) => `<div class="result-row ${r.win ? 'win' : ''}">
      <span class="medal">${['🥇', '🥈', '🥉', '🐾'][idx] || '🐾'}</span>
      <span class="r-name">${r.p.isAI ? '🤖' : '🧑'} ${r.p.name}</span>
      <span class="r-score">${r.s} 쓰담</span></div>`).join('');
  const title = winners.length > 1 ? '공동 우승! 🎉' : `${state.players[winners[0]].name} 우승! 🎉`;
  ui.$('#result-body').innerHTML = `<h2 class="win-title">${title}</h2>
    <p class="win-sub">오늘의 쓰담왕이 결정됐어요</p>
    <div class="result-list">${rows}</div>`;
  ui.showScreen('screen-result');
  setTimeout(() => sound.sfxFanfare(), 350);
}

export function rematch() {
  if (!G) return;
  if (G.mode === 'local') startLocal(G.configs, G.opts || {});
}

// ── 온라인 ───────────────────────────────────────────────
export async function startOnline(code, roomData) {
  sound.initAudio();
  const myUid = net.clientId();
  const configs = roomData.players.map((p) => ({ name: p.name, isAI: p.isAI || false, difficulty: p.difficulty || 'normal', uid: p.uid }));
  const viewer = roomData.players.findIndex((p) => p.uid === myUid);
  const opts = roomData.opts || {};
  G = {
    mode: 'online', code, configs, seed: roomData.seed, opts, viewer,
    state: reconstruct(configs, roomData.seed, roomData.log || [], opts),
    selected: new Set(), busy: false, saved: false, prevLogLen: (roomData.log || []).length,
    isHost: roomData.hostId === myUid, aiLock: false,
  };
  saveSession();
  ui.showScreen('screen-game');
  wireHand();
  G.unsub = await net.subscribe(code, (data) => onSnapshot(data));
  renderOnline();
}

async function onSnapshot(data) {
  if (!G || G.mode !== 'online') return;
  const newLog = data.log || [];
  if (newLog.length > G.prevLogLen) {
    const pre = reconstruct(G.configs, G.seed, newLog.slice(0, G.prevLogLen), G.opts);
    G.state = pre;
    for (let i = G.prevLogLen; i < newLog.length; i++) {
      const events = applyAction(G.state, newLog[i]);
      ui.renderAll(G.state, G.viewer, { selectable: false });
      await ui.animate(events, G.state, G.viewer);
    }
    G.prevLogLen = newLog.length;
  } else if (newLog.length < G.prevLogLen) {
    G.state = reconstruct(G.configs, G.seed, newLog, G.opts);
    G.prevLogLen = newLog.length;
  }
  renderOnline();
  if (G.state.phase === 'ended') { finishOnline(data); return; }

  // 호스트가 AI 차례 처리
  if (G.isHost && !G.aiLock && G.state.phase === 'playing') {
    const cur = G.state.players[G.state.current];
    if (cur.isAI) {
      G.aiLock = true;
      await delay(550);
      if (!G) return;
      const action = chooseAction(G.state, cur.difficulty);
      try { await net.pushAction(G.code, action, G.state.log.length); } catch {}
      if (G) G.aiLock = false;
    }
  }
}

function renderOnline() {
  const { state } = G;
  const myTurn = state.current === G.viewer && state.phase === 'playing';
  ui.renderAll(state, G.viewer, { selectable: myTurn, selected: G.selected });
  renderActionBar();
}

async function submitOnline(action) {
  G.busy = true;
  try {
    await net.pushAction(G.code, action, G.state.log.length);
  } catch (e) { ui.toast('⚠️ ' + e.message); }
  G.selected.clear();
  G.busy = false;
}

async function finishOnline(data) {
  if (G.saved) return;
  G.saved = true;
  clearSession();
  const record = {
    id: 'g_' + Date.now(), date: Date.now(), configs: G.configs,
    seed: G.seed, opts: G.state.opts || {}, log: G.state.log, winner: G.state.winner,
    scores: G.state.players.map((_, i) => score(G.state, i)), online: true,
  };
  saveReplay(record);
  if (G.isHost) net.setStatus(G.code, 'ended').catch(() => {});
  sound.sfxEnd();
  const trigger = G.state.players.find((pl) => pl.hand.length === 0);
  if (trigger) await ui.showGameEnd(trigger.name);
  else await new Promise((r) => setTimeout(r, 700));
  showResult(G.state);
}

export function leaveOnline() {
  if (G && G.mode === 'online') {
    if (G.unsub) G.unsub();
    net.leaveRoom(G.code).catch(() => {});
    clearSession();
  }
}

// ── 유틸 ─────────────────────────────────────────────────
function button(label, cls, fn) {
  const b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = label;
  b.onclick = fn;
  return b;
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
