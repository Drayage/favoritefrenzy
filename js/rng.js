// rng.js — 결정적 시드 기반 난수 생성기 (리플레이/멀티플레이 재현용)
// mulberry32: 빠르고 단순한 32비트 PRNG. 시드만 같으면 항상 동일한 수열을 생성한다.

export function makeRng(seed) {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9; // 0 시드 방지
  const rng = {
    // 0 이상 1 미만 실수
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // [0, n) 정수
    int(n) {
      return Math.floor(rng.next() * n);
    },
    // 배열에서 무작위 원소
    pick(arr) {
      return arr[rng.int(arr.length)];
    },
    // 현재 내부 상태(이어받기용)
    get state() {
      return a >>> 0;
    },
    set state(v) {
      a = v >>> 0;
    },
  };
  return rng;
}

// 제자리 Fisher-Yates 셔플 (rng 사용)
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 랜덤 시드 생성
export function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
