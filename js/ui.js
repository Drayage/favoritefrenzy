// ui.js — DOM 렌더링 + 애니메이션. 엔진 상태를 화면으로 그린다.
import { PETS, PET_BY_KEY, PET_KEYS_DESC, SPECIALS, getCard, cardLabel } from './cards.js';
import { petSVG, specialSVG, cardBackSVG } from './art.js';
import { score } from './engine.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let prefersAnim = true;
export function setAnimations(on) { prefersAnim = on; }

// ── 화면 전환 ─────────────────────────────────────────────
export function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

// ── 카드/존 요소 생성 ─────────────────────────────────────
export function cardEl(cardId, { faceUp = true, mini = false } = {}) {
  const c = getCard(cardId);
  const div = document.createElement('div');
  div.className = 'card' + (mini ? ' mini' : '');
  div.dataset.id = cardId;
  if (!faceUp) { div.classList.add('back'); div.innerHTML = cardBackSVG(); return div; }
  if (c.type === 'pet') {
    const pet = PET_BY_KEY[c.pet];
    div.classList.add('pet');
    div.style.setProperty('--card-color', pet.color);
    div.innerHTML = `<span class="rank">${pet.rank}</span>${petSVG(c.pet)}<span class="cname">${pet.name}</span>`;
  } else {
    const s = SPECIALS[c.special];
    div.classList.add('special');
    div.innerHTML = `${specialSVG(c.special)}<span class="cname">${s.name}</span>`;
  }
  return div;
}

// 8개 존을 팔각형으로 배치 (고양이=상단, 시계방향 순위 내림차순)
export function renderZones(state, board) {
  const wrap = $('#zones', board);
  wrap.innerHTML = '';
  const n = PET_KEYS_DESC.length;
  PET_KEYS_DESC.forEach((key, i) => {
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    const z = state.zones[key];
    const pet = PET_BY_KEY[key];
    const el = document.createElement('div');
    el.className = 'zone';
    el.dataset.pet = key;
    el.style.left = `${50 + Math.cos(ang) * 41}%`;
    el.style.top = `${50 + Math.sin(ang) * 41}%`;
    el.style.setProperty('--card-color', pet.color);
    const badge = state.badge && state.badge.pet === key ? '<span class="z-badge" title="최애 배지">🏅</span>' : '';
    const cushion = z.cushionCardId != null ? '<span class="z-cushion" title="전용 방석">🛏️</span>' : '';
    el.innerHTML = `
      <div class="z-art">${petSVG(key)}${badge}${cushion}</div>
      <div class="z-rank">${pet.rank}</div>
      <div class="z-name">${pet.name}</div>
      <div class="z-count ${z.cards.length >= 3 ? 'hot' : ''}">${'🐾'.repeat(Math.min(z.cards.length, 5))}<b>${z.cards.length}</b></div>`;
    wrap.appendChild(el);
  });
}

// 상대 패널
export function renderOpponents(state, viewer) {
  const box = $('#opponents');
  box.innerHTML = '';
  state.players.forEach((p) => {
    if (p.index === viewer) return;
    const el = document.createElement('div');
    el.className = 'opp' + (state.current === p.index ? ' turn' : '');
    el.innerHTML = `<div class="opp-name">${p.isAI ? '🤖 ' : '🧑 '}${p.name}</div>
      <div class="opp-stats"><span>🂠 ${p.hand.length}</span><span>💗 ${score(state, p.index)}</span></div>`;
    box.appendChild(el);
  });
  const ti = $('#turn-indicator');
  const cur = state.players[state.current];
  ti.textContent = state.phase === 'ended' ? '게임 종료' : `${cur.name}의 차례`;
  ti.classList.toggle('mine', state.current === viewer && state.phase !== 'ended');
}

// 내 정보 + 손패
export function renderHand(state, viewer, { selectable = false, selected = new Set() } = {}) {
  const me = state.players[viewer];
  $('#my-info').innerHTML = `<span class="me-name">🧑 ${me.name}</span>
    <span class="me-score">💗 ${score(state, viewer)} 쓰담</span>
    <span class="me-draw">남은 더미 ${state.drawPile.length}장</span>`;
  const hand = $('#hand');
  hand.innerHTML = '';
  me.hand.forEach((id) => {
    const el = cardEl(id);
    if (selectable) el.classList.add('selectable');
    if (selected.has(id)) el.classList.add('selected');
    el.dataset.id = id;
    hand.appendChild(el);
  });
}

export function renderAll(state, viewer, handOpts) {
  renderZones(state, $('#board'));
  renderOpponents(state, viewer);
  renderHand(state, viewer, handOpts);
}

// ── 작은 UI 헬퍼 ─────────────────────────────────────────
export function toast(msg, ms = 1600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), ms);
}

// 모달: html 내용 + 버튼들. resolve(value) 반환.
export function modal(title, bodyHtml) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal"><h3>${title}</h3><div class="modal-body">${bodyHtml}</div></div>`;
    document.body.appendChild(back);
    back.addEventListener('click', (e) => {
      const v = e.target.closest('[data-val]');
      if (v) { back.remove(); resolve(v.dataset.val); }
      else if (e.target === back) { back.remove(); resolve(null); }
    });
  });
}

// 존 선택 모달
export function pickZone(state, title, { onlyNonEmpty = false, noCushion = false } = {}) {
  const items = PET_KEYS_DESC.filter((k) => {
    if (onlyNonEmpty && state.zones[k].cards.length === 0) return false;
    if (noCushion && state.zones[k].cushionCardId != null) return false;
    return true;
  }).map((k) => `<button class="pick" data-val="${k}"><span class="pick-art">${petSVG(k)}</span>
      <span>${PET_BY_KEY[k].name} (${state.zones[k].cards.length}장)</span></button>`).join('');
  return modal(title, `<div class="pick-grid">${items || '<p>대상이 없어요</p>'}</div><button class="btn ghost" data-val="">취소</button>`);
}

export function pickPet(title) {
  const items = PET_KEYS_DESC.map((k) => `<button class="pick" data-val="${k}"><span class="pick-art">${petSVG(k)}</span><span>${PET_BY_KEY[k].name}</span></button>`).join('');
  return modal(title, `<div class="pick-grid">${items}</div><button class="btn ghost" data-val="">취소</button>`);
}

export function pickPlayer(state, viewer, title) {
  const items = state.players.filter((p) => p.index !== viewer).map((p) =>
    `<button class="pick wide" data-val="${p.index}">${p.isAI ? '🤖' : '🧑'} ${p.name} (손패 ${p.hand.length})</button>`).join('');
  return modal(title, `<div class="pick-grid">${items}</div><button class="btn ghost" data-val="">취소</button>`);
}

export function pickCardFromHand(state, viewer, title) {
  const me = state.players[viewer];
  const items = me.hand.map((id) => `<button class="pick card-pick" data-val="${id}">${cardLabel(id)}</button>`).join('');
  return modal(title, `<div class="pick-grid">${items}</div><button class="btn ghost" data-val="">취소</button>`);
}

// ── 애니메이션 (이벤트 기반, 이미 갱신된 DOM 위에 효과) ──
export async function animate(events, state, viewer) {
  if (!prefersAnim) return;
  for (const ev of events) {
    if (ev.type === 'place') {
      const z = $(`.zone[data-pet="${ev.pet}"]`);
      if (z) { pop(z); await wait(220); }
    } else if (ev.type === 'explode') {
      const z = $(`.zone[data-pet="${ev.pet}"]`);
      if (z) { z.classList.add('explode'); await wait(360); z.classList.remove('explode'); }
    } else if (ev.type === 'push') {
      const z = $(`.zone[data-pet="${ev.to}"]`);
      if (z) {
        z.classList.add('pushed');
        const gain = ev.defended ? 1 : (ev.cards ? ev.cards.length : 0) + (ev.badgeBonus ? 1 : 0);
        floatText(z, ev.defended ? '🛏️ 방어!' : `💗 +${gain}`);
        heartBurst(z);
        await wait(520);
        z.classList.remove('pushed');
      }
    } else if (ev.type === 'toy') {
      const z = $(`.zone[data-pet="${ev.zone}"]`);
      if (z) { floatText(z, '🧸 펑!'); await wait(300); }
    } else if (ev.type === 'cushion') {
      const z = $(`.zone[data-pet="${ev.zone}"]`);
      if (z) { pop(z); floatText(z, '🛏️'); await wait(260); }
    } else if (ev.type === 'badge') {
      const z = $(`.zone[data-pet="${ev.pet}"]`);
      if (z) { z.classList.add('sparkle'); await wait(600); z.classList.remove('sparkle'); }
    } else if (ev.type === 'treat') {
      toast('🍪 간식 거래!');
      await wait(300);
    }
  }
}

function pop(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function floatText(anchor, text) {
  const f = document.createElement('div');
  f.className = 'float-text';
  f.textContent = text;
  const r = anchor.getBoundingClientRect();
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1100);
}

function heartBurst(anchor) {
  const r = anchor.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.textContent = '💗';
    h.style.left = `${r.left + r.width / 2}px`;
    h.style.top = `${r.top + r.height / 2}px`;
    h.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    h.style.setProperty('--dy', `${-40 - Math.random() * 80}px`);
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 1000);
  }
}
