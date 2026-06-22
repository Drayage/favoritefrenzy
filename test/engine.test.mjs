// 엔진 규칙 회귀 테스트. 실행: node test/engine.test.mjs
import { createGame, applyAction, score, reconstruct } from '../js/engine.js';
import { buildDeck, getCard, PET_BY_KEY, CARD_TABLE } from '../js/cards.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

// id 헬퍼: 특정 펫의 카드 id 목록
function petIds(pet) { return CARD_TABLE.filter((c) => c.type === 'pet' && c.pet === pet).map((c) => c.id); }
function specialId(s, n = 0) { return CARD_TABLE.filter((c) => c.type === 'special' && c.special === s).map((c) => c.id)[n]; }

function freshGame() {
  const g = createGame([{ name: 'A', isAI: false }, { name: 'B', isAI: false }], 12345);
  // 결정성/종료 회피: 드로우 더미 충분, 턴수 동일
  return g;
}

console.log('덱 구성');
check('총 70장', buildDeck().length === 70);
check('고양이 8장', petIds('cat').length === 8);
check('변신왕 2장', CARD_TABLE.filter((c) => c.special === 'transform').length === 2);

console.log('밀어내기: 고양이→강아지');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('cat')[0]]; // 고양이 1장만 손에
  g.zones.cat.cards = [petIds('cat')[1], petIds('cat')[2]]; // 이미 2장
  g.zones.dog.cards = [petIds('dog')[0]]; // 강아지 1장(아래 순위, 살아있음)
  const ev = applyAction(g, { type: 'playPets', pet: 'cat', cardIds: [petIds('cat')[0]] });
  const push = ev.find((e) => e.type === 'push');
  check('폭발 후 강아지 밀어냄', push && push.to === 'dog');
  check('강아지 존 비워짐', g.zones.dog.cards.length === 0);
  check('공격자 쓰담 +1', score(g, 0) >= 1);
}

console.log('밀어내기: 빈 존 건너뛰기 (고양이→토끼)');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('cat')[0]];
  g.zones.cat.cards = [petIds('cat')[1], petIds('cat')[2]];
  g.zones.dog.cards = []; // 강아지 비어있음 → 건너뜀
  g.zones.rabbit.cards = [petIds('rabbit')[0]];
  const ev = applyAction(g, { type: 'playPets', pet: 'cat', cardIds: [petIds('cat')[0]] });
  const push = ev.find((e) => e.type === 'push');
  check('토끼를 밀어냄', push && push.to === 'rabbit');
}

console.log('고슴도치 → 고양이 래핑');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('hedgehog')[0]];
  g.zones.hedgehog.cards = [petIds('hedgehog')[1], petIds('hedgehog')[2]];
  g.zones.cat.cards = [petIds('cat')[0], petIds('cat')[1]];
  const ev = applyAction(g, { type: 'playPets', pet: 'hedgehog', cardIds: [petIds('hedgehog')[0]] });
  const push = ev.find((e) => e.type === 'push');
  check('고슴도치가 고양이 밀어냄', push && push.to === 'cat');
  check('고양이 2장 획득(+2)', score(g, 0) >= 2);
}

console.log('고슴도치: 고양이 없으면 실패');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('hedgehog')[0]];
  g.zones.hedgehog.cards = [petIds('hedgehog')[1], petIds('hedgehog')[2]];
  g.zones.cat.cards = []; // 고양이 없음
  const ev = applyAction(g, { type: 'playPets', pet: 'hedgehog', cardIds: [petIds('hedgehog')[0]] });
  const push = ev.find((e) => e.type === 'push');
  check('밀어내기 실패(push 없음)', !push);
  const exp = ev.find((e) => e.type === 'explode');
  check('폭발은 발생(실패 플래그)', exp && exp.failed);
}

console.log('전용 방석 방어');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('cat')[0]];
  g.zones.cat.cards = [petIds('cat')[1], petIds('cat')[2]];
  g.zones.dog.cards = [petIds('dog')[0], petIds('dog')[1]];
  g.zones.dog.cushionCardId = specialId('cushion'); // 강아지 존에 방석
  const ev = applyAction(g, { type: 'playPets', pet: 'cat', cardIds: [petIds('cat')[0]] });
  const push = ev.find((e) => e.type === 'push');
  check('방어 발생', push && push.defended);
  check('강아지 카드 유지(밀려나지 않음)', g.zones.dog.cards.length === 2);
  check('방석은 공격자 쓰담으로(+1)', score(g, 0) === 1);
  check('방석 제거됨', g.zones.dog.cushionCardId == null);
}

console.log('최애 배지 보너스');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('cat')[0]];
  g.zones.cat.cards = [petIds('cat')[1], petIds('cat')[2]];
  g.zones.dog.cards = [petIds('dog')[0]];
  g.badge = { owner: 0, pet: 'dog' };
  const before = score(g, 0);
  applyAction(g, { type: 'playPets', pet: 'cat', cardIds: [petIds('cat')[0]] });
  check('밀린 카드(+1) + 배지(+1) = +2', score(g, 0) - before === 2);
}

console.log('변신왕 합산으로 폭발');
{
  const g = freshGame();
  const cur = g.players[g.current];
  cur.hand = [petIds('cat')[0], specialId('transform', 0)];
  g.zones.cat.cards = [petIds('cat')[1]]; // 1장
  g.zones.dog.cards = [petIds('dog')[0]];
  const ev = applyAction(g, { type: 'playPets', pet: 'cat', cardIds: [petIds('cat')[0], specialId('transform', 0)] });
  check('고양이 1+1+변신왕=3 폭발', g.zones.cat.cards.length === 3);
  check('강아지 밀어냄', ev.find((e) => e.type === 'push'));
}

console.log('리플레이 재구성 일치');
{
  const g = createGame([{ name: 'A', isAI: false }, { name: 'B', isAI: false }], 999);
  // 임의의 합법 액션 몇 개 진행
  for (let i = 0; i < 6 && g.phase === 'playing'; i++) {
    const p = g.players[g.current];
    // 손패의 첫 펫 카드를 그 펫 존에 1장
    const petCard = p.hand.map(getCard).find((c) => c.type === 'pet');
    if (petCard) applyAction(g, { type: 'playPets', pet: petCard.pet, cardIds: [p.hand.find((id) => getCard(id).pet === petCard.pet)] });
    else applyAction(g, { type: 'pass' });
  }
  const rebuilt = reconstruct(g.configs, g.seed, g.log);
  check('재구성 점수 일치', JSON.stringify(rebuilt.players.map((_, i) => score(rebuilt, i))) === JSON.stringify(g.players.map((_, i) => score(g, i))));
  check('재구성 존 상태 일치', JSON.stringify(rebuilt.zones) === JSON.stringify(g.zones));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
