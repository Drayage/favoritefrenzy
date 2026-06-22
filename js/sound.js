// sound.js — Web Audio API 기반 BGM + 효과음. 외부 의존성 없음, 오프라인 호환.

let ctx = null;
let bgmGain = null;
let bgmEnabled = true;
let sfxEnabled = true;
let bgmTimer = null;
let bgmStep = 0;

// 5음계 C5-D5-E5-G5-A5 기반 귀여운 루프
const NOTES_HZ = [523.25, 587.33, 659.25, 783.99, 880.00];
const MELODY   = [0, 2, 4, 3, 4, 2, 1, 0, 3, 2, 0, 1, 4, 3, 2, 1];
const NOTE_DUR = 0.38; // seconds per note

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.07;
    bgmGain.connect(ctx.destination);
    if (bgmEnabled) _startBGM();
  } catch (e) { ctx = null; }
}

export function isBGMEnabled() { return bgmEnabled; }
export function isSFXEnabled() { return sfxEnabled; }

export function setBGM(on) {
  bgmEnabled = on;
  if (!ctx) return;
  if (on) _startBGM(); else _stopBGM();
}
export function setSFX(on) { sfxEnabled = on; }

// ── BGM ───────────────────────────────────────────────────
function _startBGM() {
  if (!ctx || !bgmEnabled || bgmTimer) return;
  function playNext() {
    if (!bgmEnabled || !ctx) { bgmTimer = null; return; }
    const freq = NOTES_HZ[MELODY[bgmStep % MELODY.length]];
    bgmStep++;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'triangle';
    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.025);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + NOTE_DUR * 0.78);
    osc.connect(env);
    env.connect(bgmGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + NOTE_DUR);
    bgmTimer = setTimeout(playNext, NOTE_DUR * 1000);
  }
  playNext();
}
function _stopBGM() {
  if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
}

// ── SFX 공통 헬퍼 ─────────────────────────────────────────
function tone(freq, type, dur, vol = 0.35, freqEnd = null, delay = 0) {
  if (!ctx || !sfxEnabled) return;
  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    env.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  } catch (e) {}
}

// ── SFX 함수들 ───────────────────────────────────────────
export function sfxPlace()   { tone(440, 'sine', 0.10, 0.22, 580); }

export function sfxExplode() {
  tone(250, 'sawtooth', 0.18, 0.28, 800);
  tone(480, 'square',   0.10, 0.12, 200, 0.06);
}

export function sfxPush() {
  tone(523, 'sine', 0.13, 0.28);
  tone(659, 'sine', 0.13, 0.28, null, 0.08);
  tone(784, 'sine', 0.16, 0.28, null, 0.16);
}

export function sfxCushion() {
  tone(180, 'square', 0.14, 0.28, 100);
  tone(320, 'sine',   0.10, 0.18, null, 0.05);
}

export function sfxBadge() {
  tone(880, 'sine', 0.09, 0.18);
  tone(1100, 'sine', 0.09, 0.18, null, 0.09);
  tone(1320, 'sine', 0.14, 0.20, null, 0.18);
}

export function sfxSpecial() {
  tone(380, 'triangle', 0.07, 0.20, 720);
  tone(900, 'triangle', 0.10, 0.18, 420, 0.09);
}

export function sfxTreat() {
  tone(500, 'sine', 0.07, 0.18);
  tone(350, 'sine', 0.07, 0.18, null, 0.07);
  tone(500, 'sine', 0.10, 0.22, 700, 0.15);
}

export function sfxScan(step) {
  tone(580 - step * 28, 'sine', 0.07, 0.14);
}

export function sfxEnd() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.26, 0.32, null, i * 0.18));
}
