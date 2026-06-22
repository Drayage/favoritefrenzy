// engine.js — 순수 게임 규칙 엔진.
// 상태는 (seed, configs, log) 만으로 완전히 재구성 가능하도록 plain-data 로만 구성한다.
// → 리플레이/멀티플레이가 동일 엔진을 공유하며 결정적으로 재현된다.

import { makeRng, shuffle } from './rng.js';
import {
  PETS, PET_BY_KEY, PET_KEYS_DESC, buildDeck, getCard,
  HAND_SIZE, EXPLODE_AT,
} from './cards.js';

// ── 상태 생성 ─────────────────────────────────────────────
// configs: [{ name, isAI, difficulty }] (2~4명)
export function createGame(configs, seed) {
  const rng = makeRng(seed);
  const deck = shuffle(buildDeck().map((c) => c.id), rng); // 카드 id 배열을 셔플

  const players = configs.map((c, i) => ({
    index: i,
    name: c.name,
    isAI: !!c.isAI,
    difficulty: c.difficulty || 'normal',
    hand: [],
    scorePile: [],
    bonus: 0, // 최애 배지 등 카드 없는 추가 점수
  }));

  // 플레이어당 HAND_SIZE 장 분배
  for (let r = 0; r < HAND_SIZE; r++) {
    for (const p of players) p.hand.push(deck.pop());
  }

  const zones = {};
  for (const p of PETS) zones[p.key] = { cards: [], cushionCardId: null };

  return {
    seed,
    configs,
    players,
    zones,
    drawPile: deck, // 남은 카드 = 드로우 더미 (pop으로 뽑음)
    discardPile: [],
    badge: null, // { owner, pet }
    current: 0,
    turnsPlayed: players.map(() => 0),
    rngState: rng.state,
    phase: 'playing', // 'playing' | 'ended'
    winner: null, // index | index[]
    log: [],
  };
}

// (seed, configs, log) 로부터 상태를 완전히 재구성한다. (리플레이/동기화용)
export function reconstruct(configs, seed, log) {
  const state = createGame(configs, seed);
  for (const action of log) applyAction(state, action);
  return state;
}

// ── 조회 헬퍼 ─────────────────────────────────────────────
export function score(state, i) {
  return state.players[i].scorePile.length + state.players[i].bonus;
}
export function zoneCount(state, petKey) {
  return state.zones[petKey].cards.length;
}
export function handPetCounts(player) {
  // { petKey: 장수 }, transform 장수 별도
  const counts = {};
  let transform = 0;
  for (const id of player.hand) {
    const c = getCard(id);
    if (c.type === 'pet') counts[c.pet] = (counts[c.pet] || 0) + 1;
    else if (c.special === 'transform') transform++;
  }
  return { counts, transform };
}
export function handSpecials(player) {
  return player.hand
    .map(getCard)
    .filter((c) => c.type === 'special' && c.special !== 'transform')
    .map((c) => c.special);
}

// ── 액션 적용 ─────────────────────────────────────────────
// action: { type, ... }  →  events 배열 반환(애니메이션용). 잘못된 액션이면 throw.
export function applyAction(state, action) {
  if (state.phase !== 'playing') throw new Error('게임이 이미 종료됨');
  const events = [];
  const p = state.players[state.current];

  switch (action.type) {
    case 'playPets': doPlayPets(state, p, action, events); break;
    case 'toy':      doToy(state, p, action, events); break;
    case 'treat':    doTreat(state, p, action, events); break;
    case 'cushion':  doCushion(state, p, action, events); break;
    case 'badge':    doBadge(state, p, action, events); break;
    case 'pass':     events.push({ type: 'pass', player: p.index }); break;
    default: throw new Error('알 수 없는 액션: ' + action.type);
  }

  // 행동 후 손패 5장까지 드로우 (drew 누적분도 함께 카운트)
  const drew = [];
  while (p.hand.length + drew.length < HAND_SIZE && state.drawPile.length > 0) {
    drew.push(state.drawPile.pop());
  }
  if (drew.length) {
    p.hand.push(...drew);
    events.push({ type: 'draw', player: p.index, count: drew.length });
  }

  // 로그 기록 (재현용 입력만 저장)
  state.log.push(action);
  state.turnsPlayed[state.current]++;

  // 종료 판정: 드로우 더미 소진 + 모든 플레이어 동일 턴 수
  const t = state.turnsPlayed;
  const allEqual = t.every((x) => x === t[0]);
  if (state.drawPile.length === 0 && allEqual) {
    endGame(state, events);
  } else {
    state.current = (state.current + 1) % state.players.length;
  }
  return events;
}

function doPlayPets(state, p, action, events) {
  const { pet, cardIds } = action;
  if (!PET_BY_KEY[pet]) throw new Error('잘못된 펫');
  if (!cardIds || !cardIds.length) throw new Error('카드를 선택하세요');
  // 검증: 모두 손패에 있고, 펫 카드(해당 펫) 또는 변신왕이어야 함
  for (const id of cardIds) {
    if (!p.hand.includes(id)) throw new Error('손패에 없는 카드');
    const c = getCard(id);
    const ok = (c.type === 'pet' && c.pet === pet) || (c.type === 'special' && c.special === 'transform');
    if (!ok) throw new Error('해당 존에 낼 수 없는 카드');
  }
  // 손패 -> 존
  for (const id of cardIds) {
    p.hand.splice(p.hand.indexOf(id), 1);
    state.zones[pet].cards.push(id);
  }
  events.push({ type: 'place', pet, cardIds: cardIds.slice(), player: p.index });

  // 관심 폭발 판정
  if (state.zones[pet].cards.length >= EXPLODE_AT) {
    resolveExplosion(state, pet, p, events);
  }
}

// 관심 폭발 → 밀어내기 1회
function resolveExplosion(state, petKey, scorer, events) {
  const rank = PET_BY_KEY[petKey].rank;
  let targetKey = null;

  if (rank === 1) {
    // 고슴도치: 고양이만 밀어냄
    targetKey = state.zones['cat'].cards.length > 0 ? 'cat' : null;
  } else {
    // 자신보다 아래 순위 중 가장 가까운 살아있는 존 (빈 존 건너뜀, 래핑 없음)
    for (let r = rank - 1; r >= 1; r--) {
      const k = PETS.find((x) => x.rank === r).key;
      if (state.zones[k].cards.length > 0) { targetKey = k; break; }
    }
  }

  if (!targetKey) {
    events.push({ type: 'explode', pet: petKey, player: scorer.index, failed: true });
    return;
  }

  events.push({ type: 'explode', pet: petKey, player: scorer.index, target: targetKey });
  const tz = state.zones[targetKey];

  // 전용 방석 방어
  if (tz.cushionCardId != null) {
    const cushId = tz.cushionCardId;
    tz.cushionCardId = null;
    scorer.scorePile.push(cushId); // 방석 = 1쓰담, 공격자에게
    events.push({ type: 'push', from: petKey, to: targetKey, defended: true, cushionCardId: cushId, scorer: scorer.index });
    return;
  }

  // 밀어내기: 대상 존 카드 전부 -> 공격자 쓰담 더미
  const moved = tz.cards.slice();
  tz.cards = [];
  scorer.scorePile.push(...moved);

  // 최애 배지 보너스
  let badgeBonus = false;
  if (state.badge && state.badge.pet === targetKey) {
    state.players[state.badge.owner].bonus += 1;
    badgeBonus = true;
  }
  events.push({ type: 'push', from: petKey, to: targetKey, cards: moved, scorer: scorer.index, badgeBonus, badgeOwner: state.badge ? state.badge.owner : null });
}

function takeFromHand(p, special) {
  const id = p.hand.find((cid) => {
    const c = getCard(cid);
    return c.type === 'special' && c.special === special;
  });
  if (id == null) throw new Error('보유하지 않은 특수카드: ' + special);
  p.hand.splice(p.hand.indexOf(id), 1);
  return id;
}

function doToy(state, p, action, events) {
  const cardId = takeFromHand(p, 'toy');
  const zone = state.zones[action.zone];
  if (!zone) throw new Error('잘못된 존');
  if (zone.cards.length === 0) throw new Error('빈 존에는 장난감 사용 불가');
  const removed = zone.cards.pop();
  state.discardPile.push(removed, cardId); // 제거 카드 + 장난감 모두 폐기
  events.push({ type: 'toy', zone: action.zone, removed, player: p.index });
}

function doTreat(state, p, action, events) {
  const cardId = takeFromHand(p, 'treat');
  state.discardPile.push(cardId); // 간식 카드 사용 후 폐기
  const target = state.players[action.target];
  if (!target || target.index === p.index) throw new Error('잘못된 대상');
  if (action.giveCardId == null || !p.hand.includes(action.giveCardId)) throw new Error('전달할 카드 선택 오류');

  // 내 카드 1장 -> 상대
  p.hand.splice(p.hand.indexOf(action.giveCardId), 1);
  target.hand.push(action.giveCardId);

  // 상대 손패 1장 무작위 -> 나 (게임 rng 사용 → 재현 가능)
  let takenId = null;
  if (target.hand.length > 0) {
    const rng = makeRng(0); rng.state = state.rngState;
    // 방금 받은 카드를 다시 가져오지 않도록 후보에서 제외
    const candidates = target.hand.filter((id) => id !== action.giveCardId);
    const pool = candidates.length ? candidates : target.hand;
    const idx = rng.int(pool.length);
    takenId = pool[idx];
    target.hand.splice(target.hand.indexOf(takenId), 1);
    p.hand.push(takenId);
    state.rngState = rng.state;
  }
  events.push({ type: 'treat', target: target.index, give: action.giveCardId, take: takenId, player: p.index });
}

function doCushion(state, p, action, events) {
  const cardId = takeFromHand(p, 'cushion');
  const zone = state.zones[action.zone];
  if (!zone) throw new Error('잘못된 존');
  if (zone.cushionCardId != null) throw new Error('이미 방석이 있는 존');
  zone.cushionCardId = cardId;
  events.push({ type: 'cushion', zone: action.zone, cardId, player: p.index });
}

function doBadge(state, p, action, events) {
  const cardId = takeFromHand(p, 'badge');
  if (!PET_BY_KEY[action.pet]) throw new Error('잘못된 펫');
  state.badge = { owner: p.index, pet: action.pet, cardId };
  state.discardPile.push(cardId);
  events.push({ type: 'badge', pet: action.pet, player: p.index });
}

function endGame(state, events) {
  state.phase = 'ended';
  let best = -1; let winners = [];
  for (let i = 0; i < state.players.length; i++) {
    const s = score(state, i);
    if (s > best) { best = s; winners = [i]; }
    else if (s === best) winners.push(i);
  }
  state.winner = winners.length === 1 ? winners[0] : winners;
  events.push({ type: 'end', winner: state.winner, scores: state.players.map((_, i) => score(state, i)) });
}

// ── AI/UI 보조: 현재 플레이어의 후보 액션 목록(완전 열거가 아닌 의미있는 후보) ──
export function candidateActions(state) {
  const p = state.players[state.current];
  const actions = [];
  const { counts, transform } = handPetCounts(p);

  // 펫 플레이: 각 펫에 대해 (보유 장수 전부) + (폭발 도달용으로 변신왕 보강) 후보
  for (const key of Object.keys(counts)) {
    const own = counts[key];
    const ownIds = p.hand.filter((id) => { const c = getCard(id); return c.type === 'pet' && c.pet === key; });
    const transformIds = p.hand.filter((id) => { const c = getCard(id); return c.type === 'special' && c.special === 'transform'; });
    // 후보 1: 보유한 해당 펫 전부
    actions.push({ type: 'playPets', pet: key, cardIds: ownIds.slice() });
    // 후보 2: 1장만
    if (own > 1) actions.push({ type: 'playPets', pet: key, cardIds: [ownIds[0]] });
    // 후보 3: 변신왕 보태서 폭발(EXPLODE_AT) 도달
    const need = EXPLODE_AT - state.zones[key].cards.length;
    if (need > 0 && need <= own + transformIds.length && (own < need)) {
      const useTransform = need - own;
      const ids = ownIds.concat(transformIds.slice(0, useTransform));
      actions.push({ type: 'playPets', pet: key, cardIds: ids });
    }
  }
  // 변신왕만으로 빈/적은 존을 폭발시키는 후보 (선택적)
  if (transform >= EXPLODE_AT) {
    for (const key of PET_KEYS_DESC) {
      const need = EXPLODE_AT - state.zones[key].cards.length;
      if (need > 0 && need <= transform && !counts[key]) {
        const transformIds = p.hand.filter((id) => { const c = getCard(id); return c.type === 'special' && c.special === 'transform'; });
        actions.push({ type: 'playPets', pet: key, cardIds: transformIds.slice(0, need) });
        break;
      }
    }
  }

  // 특수카드
  const specials = handSpecials(p);
  if (specials.includes('toy')) {
    for (const key of PET_KEYS_DESC) if (state.zones[key].cards.length > 0) actions.push({ type: 'toy', zone: key });
  }
  if (specials.includes('cushion')) {
    for (const key of PET_KEYS_DESC) if (state.zones[key].cards.length > 0 && state.zones[key].cushionCardId == null) actions.push({ type: 'cushion', zone: key });
  }
  if (specials.includes('treat')) {
    for (const opp of state.players) {
      if (opp.index !== p.index && opp.hand.length > 0 && p.hand.length > 1) {
        // 줄 카드는 가장 가치 낮은 것(특수 제외 펫 1장) 기본 후보
        const give = p.hand.find((id) => getCard(id).type === 'pet') ?? p.hand[0];
        actions.push({ type: 'treat', target: opp.index, giveCardId: give });
      }
    }
  }
  if (specials.includes('badge') && !state.badge) {
    for (const key of PET_KEYS_DESC) actions.push({ type: 'badge', pet: key });
  }

  if (actions.length === 0) actions.push({ type: 'pass' });
  return actions;
}
