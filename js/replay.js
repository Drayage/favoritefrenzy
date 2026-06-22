// replay.js — 액션 로그 기반 리플레이. (seed, configs, log) 를 단계적으로 재실행하며
// 각 단계의 상태 스냅샷을 만들어 재생/이동/속도 조절로 보여준다.
import { createGame, applyAction, score } from './engine.js';
import { PET_BY_KEY, PET_KEYS_DESC, getCard, cardLabel } from './cards.js';
import { petSVG } from './art.js';
import { $, $$, showScreen } from './ui.js';

let R = null;

function clone(s) { return structuredClone(s); }

// 프레임 빌드
function buildFrames(record) {
  const frames = [];
  const state = createGame(record.configs, record.seed, record.opts || {});
  frames.push({ state: clone(state), desc: '🎬 게임 시작!', actor: null });
  for (const action of record.log) {
    const actor = state.players[state.current];
    const events = applyAction(state, action);
    frames.push({ state: clone(state), desc: describe(actor, action, events), actor: actor.name });
  }
  return frames;
}

function describe(actor, action, events) {
  const who = `${actor.isAI ? '🤖' : '🧑'} ${actor.name}`;
  let what = '';
  if (action.type === 'playPets') {
    what = `${PET_BY_KEY[action.pet].name} ${action.cardIds.length}장 플레이`;
  } else if (action.type === 'toy') what = `장난감 사용 (${PET_BY_KEY[action.zone].name})`;
  else if (action.type === 'cushion') what = `전용 방석 배치 (${PET_BY_KEY[action.zone].name})`;
  else if (action.type === 'badge') what = `최애 배지 → ${PET_BY_KEY[action.pet].name}`;
  else if (action.type === 'treat') what = `간식 거래`;
  else if (action.type === 'pass') what = `패스`;

  const push = events.find((e) => e.type === 'push');
  let extra = '';
  if (push) {
    if (push.defended) extra = ` · 🛏️ ${PET_BY_KEY[push.to].name} 방어!`;
    else extra = ` · 💗 ${PET_BY_KEY[push.to].name} 밀어내기 +${(push.cards ? push.cards.length : 0) + (push.badgeBonus ? 1 : 0)}`;
  }
  return `${who} — ${what}${extra}`;
}

export function openReplay(record) {
  R = { record, frames: buildFrames(record), idx: 0, playing: false, speed: 1, timer: null };
  showScreen('screen-replay');
  R.idx = 0;
  render();
  wireControls();
}

function wireControls() {
  const map = {
    '#rp-first': () => seek(0),
    '#rp-prev': () => seek(R.idx - 1),
    '#rp-play': togglePlay,
    '#rp-next': () => seek(R.idx + 1),
    '#rp-last': () => seek(R.frames.length - 1),
  };
  for (const sel in map) { const el = $(sel); if (el) el.onclick = map[sel]; }
  $$('.rp-speed').forEach((b) => {
    b.onclick = () => { R.speed = Number(b.dataset.speed); updateSpeedUI(); if (R.playing) restartTimer(); };
  });
  updateSpeedUI();
}

function updateSpeedUI() {
  $$('.rp-speed').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === R.speed));
}

function seek(i) {
  R.idx = Math.max(0, Math.min(R.frames.length - 1, i));
  render();
  if (R.idx === R.frames.length - 1) stop();
}

function togglePlay() { R.playing ? stop() : play(); }

function play() {
  if (R.idx >= R.frames.length - 1) R.idx = 0;
  R.playing = true;
  $('#rp-play').textContent = '⏸';
  restartTimer();
}
function stop() {
  R.playing = false;
  $('#rp-play').textContent = '▶';
  clearTimeout(R.timer);
}
function restartTimer() {
  clearTimeout(R.timer);
  R.timer = setTimeout(() => {
    if (!R.playing) return;
    if (R.idx >= R.frames.length - 1) { stop(); return; }
    seek(R.idx + 1);
    if (R.playing) restartTimer();
  }, 1100 / R.speed);
}

export function closeReplay() { stop(); R = null; }

function render() {
  const f = R.frames[R.idx];
  const state = f.state;
  // 진행바
  $('#rp-progress').style.width = `${(R.idx / (R.frames.length - 1)) * 100}%`;
  $('#rp-step').textContent = `${R.idx} / ${R.frames.length - 1}`;
  $('#rp-desc').textContent = f.desc;

  // 존
  const zwrap = $('#rp-zones');
  zwrap.innerHTML = '';
  const n = PET_KEYS_DESC.length;
  PET_KEYS_DESC.forEach((key, i) => {
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    const z = state.zones[key];
    const el = document.createElement('div');
    el.className = 'zone';
    el.style.left = `${50 + Math.cos(ang) * 41}%`;
    el.style.top = `${50 + Math.sin(ang) * 41}%`;
    el.style.setProperty('--card-color', PET_BY_KEY[key].color);
    const badge = state.badge && state.badge.pet === key ? '🏅' : '';
    const cushion = z.cushionCardId != null ? '🛏️' : '';
    el.innerHTML = `<div class="z-art">${petSVG(key)}<span class="z-badge">${badge}${cushion}</span></div>
      <div class="z-name">${PET_BY_KEY[key].name}</div>
      <div class="z-count ${z.cards.length >= 3 ? 'hot' : ''}"><b>${z.cards.length}</b></div>`;
    zwrap.appendChild(el);
  });

  // 점수판
  const sb = $('#rp-players');
  sb.innerHTML = state.players.map((p, idx) =>
    `<div class="rp-player ${state.current === idx && state.phase === 'playing' ? 'turn' : ''}">
      <span>${p.isAI ? '🤖' : '🧑'} ${p.name}</span><b>💗 ${score(state, idx)}</b></div>`).join('');
}
