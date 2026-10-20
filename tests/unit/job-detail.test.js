// What runs on an account, with its games (cut out of main.js): the account list, the Overview and the resume message name the job and the game, so a job of
// an account that is not on screen (one resumed at startup) can be found. Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
function fn(name) {
  const a = src.indexOf('\nfunction ' + name + '(');
  if (a < 0) throw new Error('no function ' + name);
  return src.slice(a, src.indexOf('\n}\n', a) + 3);
}
const ctx = { JSON, Math, ct: (x) => ({ 'Saat Yükseltme': 'Hour boosting', 'Kart Düşürme': 'Card farming', 'Gerçekçi Mod': 'Realistic Mode' }[x] || x) };
vm.createContext(ctx);
vm.runInContext(src.match(/const JOB_TITLE = [^\n]*\n/)[0] + fn('accountJobDetail') + fn('resumedText') + 'this.api = { accountJobDetail, resumedText };', ctx);
const { accountJobDetail, resumedText } = ctx.api;

const boost = { boost: { runningFlag: true, request: { games: [{ appid: 730, name: 'Counter-Strike 2' }] } } };
check('an hour boost names its game', JSON.stringify(accountJobDetail(boost)) === '[{"kind":"hours","games":["Counter-Strike 2"],"more":0}]', JSON.stringify(accountJobDetail(boost)));
check('the resume message says what runs again, in the interface language', resumedText(boost) === 'Hour boosting (Counter-Strike 2)', resumedText(boost));
const many = { boost: { runningFlag: true, request: { games: [1, 2, 3, 4].map((i) => ({ appid: i, name: 'Game ' + i })) } } };
check('a boost of many games names two and counts the rest', resumedText(many) === 'Hour boosting (Game 1, Game 2 +2)', resumedText(many));
const all = {
  farm: { running: true, currentActiveAppid: 20, games: [{ appid: 10, name: 'Ten' }, { appid: 20, name: 'Twenty' }] },
  hoursFarm: { running: true, games: [{ appid: 5, name: 'Five' }] },
  realistic: { activeIds: { appid: 636150, gameTitle: 'Cyberhunt' } },
};
check('card farming names the game on screen, sequential idling its games, Realistic Mode its game', resumedText(all) === 'Card farming (Twenty) · Hour boosting (Five) · Realistic Mode (Cyberhunt)', resumedText(all));
check('a game without a name is "App <id>"', accountJobDetail({ boost: { runningFlag: true, request: { appids: [440] } } })[0].games[0] === 'App 440');
check('nothing runs: no detail', accountJobDetail({}).length === 0 && accountJobDetail(null).length === 0);
process.exit(failures ? 1 : 0);
