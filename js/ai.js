// ai.js — 난이도별 AI 수 선택.
// 주의: AI 내부 무작위성은 Math.random 사용(게임 rng 와 분리) → 리플레이 재현에 영향 없음.
// 선택된 "액션"만 로그에 기록되므로 AI 로직은 비결정적이어도 재현에 문제없다.

import { candidateActions, score, applyAction, zoneCount } from './engine.js';
import { PET_BY_KEY, getCard } from './cards.js';

function clone(state) {
  return structuredClone(state);
}

// 상태 평가(해당 플레이어 관점). 높을수록 좋다.
function evaluate(state, me) {
  const myScore = score(state, me);
  let oppBest = 0;
  for (let i = 0; i < state.players.length; i++) {
    if (i !== me) oppBest = Math.max(oppBest, score(state, i));
  }
  // 손패의 잠재력: 같은 펫 2장 보유 = 폭발 준비
  const p = state.players[me];
  const counts = {};
  let pairBonus = 0;
  for (const id of p.hand) {
    const c = getCard(id);
    if (c.type === 'pet') { counts[c.pet] = (counts[c.pet] || 0) + 1; }
    else pairBonus += 0.4; // 특수카드 보유 가치
  }
  for (const k in counts) if (counts[k] >= 2) pairBonus += 0.6;
  return myScore * 10 - oppBest * 7 + pairBonus;
}

// 액션을 가상 적용한 뒤의 내 관점 가치
function valueAfter(state, action, me) {
  try {
    const s = clone(state);
    applyAction(s, action);
    return evaluate(s, me);
  } catch (e) {
    return -Infinity;
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 동점 후보 중 무작위
function bestOf(scored) {
  let best = -Infinity;
  for (const s of scored) if (s.v > best) best = s.v;
  const top = scored.filter((s) => s.v >= best - 1e-6);
  return pickRandom(top).a;
}

export function chooseAction(state, difficulty) {
  const me = state.current;
  const actions = candidateActions(state);
  if (actions.length === 1) return actions[0];

  if (difficulty === 'easy') {
    // 70% 즉시 득점 가능한 수 선호, 아니면 랜덤
    const scoring = actions.filter((a) => valueAfter(state, a, me) > evaluate(state, me) + 5);
    if (scoring.length && Math.random() < 0.7) return pickRandom(scoring);
    // 펫 플레이를 약간 더 선호
    const pets = actions.filter((a) => a.type === 'playPets');
    if (pets.length && Math.random() < 0.6) return pickRandom(pets);
    return pickRandom(actions);
  }

  if (difficulty === 'hard') {
    // 1-ply 평가 + 약간의 전략 가중치
    const scored = actions.map((a) => ({ a, v: valueAfter(state, a, me) + strategyBonus(state, a, me) }));
    return bestOf(scored);
  }

  // normal (기본): 즉시 가치 기반 1-ply
  const scored = actions.map((a) => ({ a, v: valueAfter(state, a, me) }));
  return bestOf(scored);
}

// 어려움 난이도용 전략 보너스
function strategyBonus(state, action, me) {
  let b = 0;
  if (action.type === 'badge') {
    // 높은 순위 펫(자주 밀려나는 표적)에 배지
    b += (PET_BY_KEY[action.pet].rank) * 0.3;
  }
  if (action.type === 'cushion') {
    // 카드가 많이 쌓인 존(잃으면 손해 큰)을 방어
    b += zoneCount(state, action.zone) * 0.5;
  }
  if (action.type === 'playPets') {
    // 폭발을 일으키는 수에 가중
    const after = zoneCount(state, action.pet) + action.cardIds.length;
    if (after >= 3) b += 1.5;
    // 너무 일찍 카드를 흘리지 않도록 1장만 내는 건 약간 감점
    if (action.cardIds.length === 1 && after < 3) b -= 0.3;
  }
  return b;
}
