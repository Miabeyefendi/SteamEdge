// FarmController fast mode threshold and phases.
// Run with `npm test` (tests/run.js).
const FC = require('../../src/core/farmController.js');
const played = []; const eng = { play: (ids, o) => played.push(ids.slice()), stop() {}, playingApps: () => played[played.length-1] || [] };
const events = []; 
const fc = new FC(eng, (ch, d) => events.push(d), 'card');
const games = [{appid:1,name:'a',remaining:2,playtimeMin:0},{appid:2,name:'b',remaining:2,playtimeMin:50}];
fc.start('fast', games, 300000, { fastMinPlaytimeMin: 0, maxGames: 32 });
setTimeout(() => { console.log('threshold 0 -> first play call:', JSON.stringify(played[0]), 'phase:', fc.phaseName); fc.stop('user');
  const played2 = played.length; played.length = 0;
  const fc2 = new FC(eng, (ch, d) => {}, 'card');
  fc2.start('fast', games, 300000, { fastMinPlaytimeMin: 120, maxGames: 32 });
  setTimeout(() => { console.log('threshold 120 -> first play call:', JSON.stringify(played[0]), 'phase:', fc2.phaseName); fc2.stop('user'); process.exit(0); }, 300);
}, 300);
