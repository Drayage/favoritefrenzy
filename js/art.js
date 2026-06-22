// art.js — 인라인 SVG 아트. SD(슈퍼디포르메) 플랫 스타일, 큰 눈/둥근 얼굴/통통 비율.
// 모두 viewBox="0 0 100 100". 색은 cards.js 의 펫 color 를 기본으로 사용.

import { PET_BY_KEY, SPECIALS } from './cards.js';

const EYE = '#3a2f3a';
const BLUSH = '#ff9bb3';

// 공통: 둥근 머리 + 큰 눈 베이스
function face(color, inner) {
  return `
    <ellipse cx="50" cy="58" rx="34" ry="32" fill="${color}"/>
    <ellipse cx="50" cy="64" rx="22" ry="20" fill="#fff" opacity="0.55"/>
    ${inner}
  `;
}

const PETS_SVG = {
  // 고양이 — 도도함(반쯤 감은 눈, 새침한 입)
  cat: (c) => `
    ${triEar(28, 30, c)} ${triEar(72, 30, c)}
    ${face(c, `
      <g class="pet-eyes">
        <path d="M36 56 q5 4 10 0" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M54 56 q5 4 10 0" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M47 66 q3 3 6 0" stroke="${EYE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <g stroke="${EYE}" stroke-width="1.6" stroke-linecap="round">
        <line x1="22" y1="62" x2="36" y2="63"/><line x1="22" y1="68" x2="36" y2="67"/>
        <line x1="78" y1="62" x2="64" y2="63"/><line x1="78" y1="68" x2="64" y2="67"/>
      </g>`)}`,
  // 강아지 — 해맑음(큰 눈, 헤벌쭉 + 혀)
  dog: (c) => `
    ${floppyEar(22, 44, c)} ${floppyEar(78, 44, c)}
    ${face(c, `
      ${eye(38, 56)} ${eye(62, 56)}
      <ellipse cx="50" cy="64" rx="5" ry="4" fill="${EYE}"/>
      <path d="M40 70 q10 10 20 0" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M50 72 q4 8 -2 12 q-4 -2 -4 -8 z" fill="${BLUSH}"/>`)}`,
  // 토끼 — 수줍음(긴 귀, 볼터치)
  rabbit: (c) => `
    ${longEar(40, c)} ${longEar(60, c)}
    ${face(c, `
      ${eye(38, 58)} ${eye(62, 58)}
      <circle cx="30" cy="68" r="5" fill="${BLUSH}" opacity="0.8"/>
      <circle cx="70" cy="68" r="5" fill="${BLUSH}" opacity="0.8"/>
      <path d="M48 66 l2 3 l2 -3" stroke="${EYE}" stroke-width="2" fill="none"/>
      <path d="M46 72 q4 3 8 0" stroke="${EYE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`)}`,
  // 햄스터 — 먹보(빵빵한 볼, 씨앗)
  hamster: (c) => `
    ${triEar(34, 32, c)} ${triEar(66, 32, c)}
    ${face(c, `
      <ellipse cx="30" cy="70" rx="11" ry="9" fill="${c}"/>
      <ellipse cx="70" cy="70" rx="11" ry="9" fill="${c}"/>
      ${eye(40, 56)} ${eye(60, 56)}
      <ellipse cx="50" cy="64" rx="4" ry="3" fill="${EYE}"/>
      <path d="M44 70 q6 5 12 0" stroke="${EYE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="50" cy="84" rx="6" ry="7" fill="#caa15e"/>`)}`,
  // 앵무새 — 수다쟁이(부리, 말풍선 점)
  parrot: (c) => `
    <path d="M50 18 q14 6 8 22 q-8 -6 -8 -22z" fill="${c}"/>
    ${face(c, `
      ${eye(40, 56)} ${eye(60, 56)}
      <path d="M44 66 q6 0 12 0 l-3 9 q-3 3 -6 0 z" fill="#ff9f4d"/>
      <circle cx="80" cy="40" r="3" fill="${EYE}" opacity="0.5"/>
      <circle cx="88" cy="34" r="2.2" fill="${EYE}" opacity="0.4"/>`)}`,
  // 기니피그 — 겁쟁이(부들부들 큰 눈, 땀)
  guineapig: (c) => `
    ${face(c, `
      ${eye(38, 56, 7)} ${eye(62, 56, 7)}
      <ellipse cx="50" cy="66" rx="3.5" ry="3" fill="${EYE}"/>
      <path d="M45 72 q5 -3 10 0" stroke="${EYE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M80 50 q3 6 0 9 q-3 -3 0 -9z" fill="#9fd6ff"/>
      <line x1="18" y1="58" x2="34" y2="58" stroke="#d8b46a" stroke-width="2"/>
      <line x1="66" y1="58" x2="82" y2="58" stroke="#d8b46a" stroke-width="2"/>`)}`,
  // 페럿 — 장난꾸러기(윙크, 장난스런 혀)
  ferret: (c) => `
    ${triEar(34, 34, c)} ${triEar(66, 34, c)}
    ${face(c, `
      <g class="pet-eyes"><path d="M34 56 q4 -4 8 0" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="round"/></g>
      ${eye(62, 56)}
      <ellipse cx="50" cy="64" rx="3.5" ry="3" fill="${EYE}"/>
      <path d="M44 70 q6 6 12 0" stroke="${EYE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M52 72 q3 4 0 7 q-3 -1 -3 -5z" fill="${BLUSH}"/>`)}`,
  // 고슴도치 — 새침함(가시, 시크한 눈)
  hedgehog: (c) => `
    ${spikes(c)}
    <ellipse cx="50" cy="64" rx="26" ry="24" fill="#f4e3cf"/>
    ${eye(42, 62)} ${eye(58, 62)}
    <ellipse cx="50" cy="72" rx="5" ry="4" fill="${EYE}"/>
    <path d="M46 78 q4 -2 8 0" stroke="${EYE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="72" r="4" fill="${BLUSH}" opacity="0.7"/>
    <circle cx="66" cy="72" r="4" fill="${BLUSH}" opacity="0.7"/>`,
};

// 부품들
function eye(x, y, r = 5.5) {
  return `<g class="pet-eyes"><circle cx="${x}" cy="${y}" r="${r}" fill="${EYE}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/></g>`;
}
function triEar(x, y, c) {
  return `<path d="M${x - 12} ${y + 14} L${x} ${y - 8} L${x + 12} ${y + 14} Z" fill="${c}"/>`;
}
function floppyEar(x, y, c) {
  return `<ellipse cx="${x}" cy="${y}" rx="10" ry="18" fill="${c}" opacity="0.92"/>`;
}
function longEar(x, c) {
  return `<ellipse cx="${x}" cy="26" rx="6" ry="20" fill="${c}"/><ellipse cx="${x}" cy="28" rx="3" ry="14" fill="${BLUSH}" opacity="0.6"/>`;
}
function spikes(c) {
  let s = '';
  for (let a = 0; a < 14; a++) {
    const ang = Math.PI * (0.05 + (a / 13) * 0.9) - Math.PI; // 위쪽 반원
    const cx = 50 + Math.cos(ang) * 30;
    const cy = 60 + Math.sin(ang) * 30;
    s += `<path d="M${cx} ${cy} l${Math.cos(ang) * 14} ${Math.sin(ang) * 14} l4 4 z" fill="${c}"/>`;
  }
  return s;
}

// 펫 SVG 마크업 반환
export function petSVG(key) {
  const pet = PET_BY_KEY[key];
  const inner = PETS_SVG[key](pet.color);
  return `<svg viewBox="0 0 100 100" class="art" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// 특수카드 SVG (이모지 활용 + 파스텔 배경 원)
const SPECIAL_BG = {
  transform: '#d8f5e0', toy: '#ffe4cf', treat: '#f0e0ff', cushion: '#fde8d0', badge: '#ffd9e8',
};
export function specialSVG(key) {
  const s = SPECIALS[key];
  const bg = SPECIAL_BG[key] || '#fff0e0';
  return `<svg viewBox="0 0 100 100" class="art" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="40" fill="${bg}"/>
    <text x="50" y="50" font-size="46" text-anchor="middle" dominant-baseline="central">${s.emoji}</text>
  </svg>`;
}

// 카드 뒷면 (발바닥 패턴)
export function cardBackSVG() {
  return `<svg viewBox="0 0 100 140" class="art" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="94" height="134" rx="14" fill="#ffd9e6"/>
    <rect x="10" y="10" width="80" height="120" rx="10" fill="#ffeaf1"/>
    ${paw(50, 70, 1)}
  </svg>`;
}

// 고양이 발바닥 (로고/아이콘 공용)
export function paw(cx, cy, scale = 1) {
  const r = 13 * scale;
  const t = 5 * scale;
  return `<g transform="translate(${cx} ${cy})">
    <ellipse cx="0" cy="6" rx="${r}" ry="${r * 0.85}" fill="#ff9bb3"/>
    <circle cx="${-r}" cy="${-r * 0.5}" r="${t}" fill="#ff9bb3"/>
    <circle cx="${-r * 0.35}" cy="${-r}" r="${t}" fill="#ff9bb3"/>
    <circle cx="${r * 0.35}" cy="${-r}" r="${t}" fill="#ff9bb3"/>
    <circle cx="${r}" cy="${-r * 0.5}" r="${t}" fill="#ff9bb3"/>
  </g>`;
}

// 메인 로고 마크 (왕관+발바닥+하트)
export function logoSVG() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M40 28 L52 40 L60 26 L68 40 L80 28 L76 50 L44 50 Z" fill="#ffd166"/>
    ${paw(60, 74, 1.3)}
    <path d="M30 64 q-6 -8 -12 -2 q-3 4 12 14 q15 -10 12 -14 q-6 -6 -12 2z" fill="#ff8fb0"/>
    <path d="M90 64 q-6 -8 -12 -2 q-3 4 12 14 q15 -10 12 -14 q-6 -6 -12 2z" fill="#ff8fb0"/>
  </svg>`;
}
