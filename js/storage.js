// storage.js — localStorage 기반 리플레이 보관(최근 10게임) + 설정 + 내보내기/불러오기

const GAMES_KEY = 'ff_replays_v1';
const SETTINGS_KEY = 'ff_settings_v1';
const MAX_GAMES = 10;

export function loadReplays() {
  try { return JSON.parse(localStorage.getItem(GAMES_KEY)) || []; }
  catch { return []; }
}

// record: { id, date, configs, seed, log, winner, scores }
export function saveReplay(record) {
  const list = loadReplays();
  list.unshift(record);
  while (list.length > MAX_GAMES) list.pop();
  try { localStorage.setItem(GAMES_KEY, JSON.stringify(list)); } catch {}
  return list;
}

export function deleteReplay(id) {
  const list = loadReplays().filter((r) => r.id !== id);
  try { localStorage.setItem(GAMES_KEY, JSON.stringify(list)); } catch {}
  return list;
}

// 불러온 리플레이를 목록에 추가(중복 id 회피)
export function addReplay(record) {
  if (!record || !record.seed || !Array.isArray(record.log)) throw new Error('잘못된 리플레이 파일');
  record.id = record.id || ('imp_' + Date.now());
  // 동일 id 존재 시 새 id 부여
  if (loadReplays().some((r) => r.id === record.id)) record.id = 'imp_' + Date.now() + '_' + Math.floor(Math.random() * 999);
  record.imported = true;
  return saveReplay(record);
}

export function loadSettings() {
  try { return Object.assign(defaultSettings(), JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch { return defaultSettings(); }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
function defaultSettings() {
  return { sound: true, animations: true, playerName: '집사', difficulty: 'normal' };
}

// ── 내보내기 / 불러오기 ────────────────────────────────
export function exportReplay(record) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date(record.date || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `favorite-frenzy-replay-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importReplayFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (e) { reject(new Error('JSON 파싱 실패')); }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  });
}
