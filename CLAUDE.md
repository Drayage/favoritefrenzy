# 최애 쟁탈전 (Favorite Frenzy) — 카드게임

바닐라 JS. 2v2 팀전, Firebase(Firestore) 온라인, PWA, GitHub Pages 배포.

## 파일 지도

- `js/engine.js` — 게임 규칙 / `js/cards.js` — 카드 정의
- `js/controller.js`(~470줄), `js/main.js`(~500줄) — 진행 제어/진입점
- `js/ui.js`, `js/art.js` — 렌더/그림 / `js/ai.js` — AI 상대
- `js/firebase.js`, `js/firebase-config.js` — 온라인 / `js/storage.js` — 새로고침 복원
- `js/replay.js`, `js/sound.js`, `js/rng.js`
- `sw.js` — PWA 캐시 (network-first + 에셋 버전 쿼리 + controllerchange 1회 reload — **유지할 것**)

## 규칙

- 새 CSS 클래스는 `.empty` 같은 일반명 금지, `.zone-empty`처럼 구체적 프리픽스 사용
  (클래스명 충돌로 40px 밀림 버그 전례).
- 존 레이아웃은 높이 고정 + overflow 방식으로 안정화되어 있다 — 겹침/밀림 수정 시
  z-index 덧대기 대신 이 방식을 유지 (z-index 시행착오 8커밋 전례).
- 특수카드 이름/이모지는 사용자가 확정한 상태(🧸🎪🛏️🏅) — 임의 변경 금지.
- SW/캐시/배포/모바일: webgame-ship 스킬 참조.
- 온라인(방/동기화/규칙): firebase-online 스킬 참조.
