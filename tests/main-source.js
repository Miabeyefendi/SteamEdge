// The text of the main process: main.js plus the modules moved out of it (src/backend). Tests cut pieces of code out of it by text markers,
// so they read it as it was before the move: the factory wrapper and its `return` are dropped, the indent is taken off and `ctx.name`
// (how a module reads a main.js variable) is written as plain `name` again.
const fs = require('fs');
const path = require('path');

function unwrap(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('module.exports = function init(ctx) {'));
  let end = lines.length - 1;
  while (end > start && !/^\};\s*$/.test(lines[end])) end--;
  let body = lines.slice(start + 1, end);
  while (body.length && /^\s*return (\{.*\});\s*$/.test(body[body.length - 1]) === false && body[body.length - 1].trim() === '') body.pop();
  if (body.length && /^\s*return \{.*\};\s*$/.test(body[body.length - 1])) body.pop();
  if (body.length && /^\s*const \{[^}]*\} = ctx;\s*$/.test(body[0])) body.shift();
  return body.map((l) => l.replace(/^ {2}/, '')).join('\n').replace(/\bctx\.(\w+)/g, '$1')
    .replace(/require\('\.\.\//g, "require('./src/").replace(/path\.join\(__dirname, '\.\.', /g, "path.join(__dirname, 'src', ");
}

module.exports = function readMainSource() {
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'src', 'backend');
  const modules = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => unwrap(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
  return [fs.readFileSync(path.join(root, 'main.js'), 'utf8')].concat(modules).join('\n');
};
