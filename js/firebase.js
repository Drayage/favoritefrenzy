// firebase.js — Firestore 실시간 멀티플레이.
// 모델: 방 문서에 (seed, configs, log[]) 만 공유한다. 모든 클라이언트는 동일 엔진으로
// 상태를 결정적으로 재구성하므로, 현재 플레이어가 자기 액션을 log 에 추가하기만 하면
// 모든 참가자가 onSnapshot 으로 동일하게 동기화된다. (호스트가 게임 시작/시드 결정)
//
// SDK 는 오프라인 단일플레이를 막지 않도록 사용 시점에 ESM CDN 에서 동적 import 한다.

import { firebaseConfig } from './firebase-config.js';
import { randomSeed } from './rng.js';

const SDK = '10.12.0';
let _fb = null; // { db, fns }

async function ensure() {
  if (_fb) return _fb;
  const app = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`);
  const a = app.initializeApp(firebaseConfig);
  const db = fs.getFirestore(a);
  _fb = { db, fs };
  return _fb;
}

// 안정적인 익명 클라이언트 ID (재접속 시 동일 좌석 식별)
export function clientId() {
  let id = localStorage.getItem('ff_uid');
  if (!id) { id = 'u_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('ff_uid', id); }
  return id;
}

function code6() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// 방 생성 → 방 코드 반환
export async function createRoom(hostName) {
  const { db, fs } = await ensure();
  const uid = clientId();
  let code = code6();
  const ref = fs.doc(db, 'rooms', code);
  // 충돌 시 재시도
  let exists = (await fs.getDoc(ref)).exists();
  let tries = 0;
  let r = ref;
  while (exists && tries < 5) { code = code6(); r = fs.doc(db, 'rooms', code); exists = (await fs.getDoc(r)).exists(); tries++; }

  await fs.setDoc(r, {
    code,
    hostId: uid,
    status: 'lobby',
    seed: 0,
    players: [{ uid, name: hostName || '집사', isAI: false, difficulty: 'normal' }],
    log: [],
    createdAt: fs.serverTimestamp(),
  });
  return code;
}

// 방 참가
export async function joinRoom(code, name) {
  const { db, fs } = await ensure();
  const uid = clientId();
  const ref = fs.doc(db, 'rooms', code.toUpperCase());
  await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('존재하지 않는 방 코드');
    const data = snap.data();
    if (data.status !== 'lobby') throw new Error('이미 시작된 방');
    const players = data.players.slice();
    if (players.some((p) => p.uid === uid)) return; // 재입장
    if (players.length >= 4) throw new Error('방이 가득 찼습니다 (최대 4명)');
    players.push({ uid, name: name || '집사', isAI: false, difficulty: 'normal' });
    tx.update(ref, { players });
  });
  return code.toUpperCase();
}

// 호스트가 게임 시작: 시드 확정 + status=playing
export async function startGame(code) {
  const { db, fs } = await ensure();
  const ref = fs.doc(db, 'rooms', code);
  await fs.updateDoc(ref, { seed: randomSeed(), status: 'playing', log: [] });
}

// 실시간 구독
export async function subscribe(code, cb) {
  const { db, fs } = await ensure();
  const ref = fs.doc(db, 'rooms', code);
  return fs.onSnapshot(ref, (snap) => { if (snap.exists()) cb(snap.data()); });
}

// 현재 턴 플레이어가 액션을 log 에 추가 (낙관적 동시성: 길이 검증)
export async function pushAction(code, action, expectedLen) {
  const { db, fs } = await ensure();
  const ref = fs.doc(db, 'rooms', code);
  await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('방이 사라졌습니다');
    const data = snap.data();
    if (data.log.length !== expectedLen) return; // 누군가 먼저 둠 → 무시(다음 스냅샷에서 갱신)
    const log = data.log.concat([action]);
    tx.update(ref, { log });
  });
}

export async function setStatus(code, status) {
  const { db, fs } = await ensure();
  await fs.updateDoc(fs.doc(db, 'rooms', code), { status });
}

export async function leaveRoom(code) {
  try {
    const { db, fs } = await ensure();
    const uid = clientId();
    const ref = fs.doc(db, 'rooms', code);
    await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === 'playing') return; // 진행 중엔 좌석 유지
      const players = data.players.filter((p) => p.uid !== uid);
      if (players.length === 0) tx.delete(ref);
      else tx.update(ref, { players });
    });
  } catch {}
}
