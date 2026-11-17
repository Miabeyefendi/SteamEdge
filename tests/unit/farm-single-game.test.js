// One game left in a card farm: it is opened once and stays open. The same list sent again every 10-15 seconds (fast mode) or every
// "time per game" (the other modes) restarts that game's session on Steam, and a game restarted all the time does not drop its cards.
// With two or more games fast mode still refreshes the list at its rhythm.
// Run with `npm test` (tests/run.js).
const FC = require('../../src/core/farmController.js');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const make = () => {
  const played = [];
  const eng = { play: (ids) => played.push(ids.slice()), stop() {}, playingApps: () => played[played.length - 1] || [] };
  return { played, fc: new FC(eng, () => {}, 'card') };
};

// fast mode, one game past the threshold
{
  const { played, fc } = make();
  fc.start('fast', [{ appid: 7, name: 'one', remaining: 4, playtimeMin: 200 }], 300000, { fastMinPlaytimeMin: 60, maxGames: 32 });
  setTimeout(() => {
    check('fast, one game: it is opened', JSON.stringify(played) === '[[7]]', JSON.stringify(played));
    fc._fastRotate(); fc._fastRotate(); fc._fastRotate();
    check('fast, one game: later rotations send nothing', played.length === 1, String(played.length));
    // the pool changes (a game finished): the list goes to Steam again
    fc.updateGames([{ appid: 7, name: 'one', remaining: 3 }], new Set());
    fc._refreshPool();
    check('fast, one game: a changed pool is sent again', played.length === 2, String(played.length));
    fc.stop('user');
    check('a stop forgets the game, a restart sends it again', fc._singleSent === null);

    // fast mode, two games: the refresh stays
    const b = make();
    b.fc.start('fast', [{ appid: 1, name: 'a', remaining: 2, playtimeMin: 200 }, { appid: 2, name: 'b', remaining: 2, playtimeMin: 200 }], 300000, { fastMinPlaytimeMin: 60, maxGames: 32 });
    setTimeout(() => {
      const before = b.played.length;
      b.fc._fastRotate(); b.fc._fastRotate();
      check('fast, two games: every rotation still refreshes the list', b.played.length === before + 2, before + ' -> ' + b.played.length);
      b.fc.stop('user');

      // sequential mode, one game: when its time is up it is the same game, kept open
      const c = make();
      c.fc.start('sequential', [{ appid: 9, name: 'solo', remaining: 5, playtimeMin: 0 }], 300000, {});
      check('sequential, one game: it is opened', c.played.length === 1, String(c.played.length));
      c.fc._roundTimeUp(); c.fc._roundTimeUp();
      check('sequential, one game: its time running out does not send it again', c.played.length === 1, String(c.played.length));
      c.fc.stop('user');

      // sequential mode, two games: each one is opened in turn
      const d = make();
      d.fc.start('sequential', [{ appid: 1, name: 'a', remaining: 5 }, { appid: 2, name: 'b', remaining: 5 }], 300000, {});
      d.fc._roundTimeUp(); d.fc._roundTimeUp();
      check('sequential, two games: they still take turns', d.played.length === 3 && JSON.stringify(d.played[1]) === '[2]', JSON.stringify(d.played));
      d.fc.stop('user');
      process.exit(failures ? 1 : 0);
    }, 200);
  }, 200);
}
