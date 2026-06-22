// cards.js — 카드/반려동물 정의, 순위표, 덱 빌더 (총 70장)

// 반려동물 8종. rank가 높을수록 관심 순위가 높다(고양이 8 ~ 고슴도치 1).
// key 는 내부 식별자, name 은 한글 표시명, trait 은 성격(아트/대사용).
export const PETS = [
  { key: 'cat',       rank: 8, name: '고양이',   trait: '도도함',   color: '#caa7ff' },
  { key: 'dog',       rank: 7, name: '강아지',   trait: '해맑음',   color: '#8fc7ff' },
  { key: 'rabbit',    rank: 6, name: '토끼',     trait: '수줍음',   color: '#ffb3c7' },
  { key: 'hamster',   rank: 5, name: '햄스터',   trait: '먹보',     color: '#ffc98f' },
  { key: 'parrot',    rank: 4, name: '앵무새',   trait: '수다쟁이', color: '#8fe0c2' },
  { key: 'guineapig', rank: 3, name: '기니피그', trait: '겁쟁이',   color: '#ffd98f' },
  { key: 'ferret',    rank: 2, name: '페럿',     trait: '장난꾸러기', color: '#bfead0' },
  { key: 'hedgehog',  rank: 1, name: '고슴도치', trait: '새침함',   color: '#d9c2a8' },
];

// key -> pet 정의
export const PET_BY_KEY = Object.fromEntries(PETS.map((p) => [p.key, p]));
// rank -> pet 정의
export const PET_BY_RANK = Object.fromEntries(PETS.map((p) => [p.rank, p]));
// 순위 내림차순 key 배열 (8 -> 1)
export const PET_KEYS_DESC = PETS.slice().sort((a, b) => b.rank - a.rank).map((p) => p.key);

// 특수카드 정의
export const SPECIALS = {
  transform: { key: 'transform', name: '카멜레온',  count: 2, desc: '아무 반려동물로 변신해 합산 가능',    emoji: '🦎' },
  toy:       { key: 'toy',       name: '낚싯대',   count: 1, desc: '선택한 존의 카드를 전부 낚아 제거',   emoji: '🎣' },
  treat:     { key: 'treat',     name: '선물 상자', count: 1, desc: '상대와 손패를 전부 교환',           emoji: '🎁' },
  cushion:   { key: 'cushion',   name: '방패',      count: 1, desc: '다음 밀어내기 1회 방어',           emoji: '🛡️' },
  badge:     { key: 'badge',     name: '응원 리본', count: 1, desc: '지정 펫 밀려날 때마다 +1쓰담',     emoji: '🎀' },
};

export const PETS_PER_TYPE = 8;
export const HAND_SIZE = 5;
export const EXPLODE_AT = 3; // 관심 폭발 임계치

// 전체 덱(카드 객체 배열, 고유 id 부여) 생성.
// 카드: { id, type:'pet'|'special', pet?, rank?, special? }
export function buildDeck() {
  const deck = [];
  let id = 0;
  for (const p of PETS) {
    for (let i = 0; i < PETS_PER_TYPE; i++) {
      deck.push({ id: id++, type: 'pet', pet: p.key, rank: p.rank });
    }
  }
  for (const s of Object.values(SPECIALS)) {
    for (let i = 0; i < s.count; i++) {
      deck.push({ id: id++, type: 'special', special: s.key });
    }
  }
  return deck; // 총 70장
}

// 카드 id -> 카드 정의 조회용 고정 테이블.
// buildDeck()는 항상 동일한 순서/ id(0..69)를 생성하므로 인덱스가 곧 id다.
export const CARD_TABLE = buildDeck();
export function getCard(id) {
  return CARD_TABLE[id];
}

// 카드 1장의 짧은 표시 이름
export function cardLabel(card) {
  if (typeof card === 'number') card = getCard(card);
  if (card.type === 'pet') return PET_BY_KEY[card.pet].name;
  return SPECIALS[card.special].name;
}
