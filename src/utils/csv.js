'use strict';
// CSV text for a spreadsheet: comma separated, CRLF line ends, a quoted field when it holds a comma, a quote or a line
// break. A text that starts with = + - or @ would be run as a formula by Excel and the like (a game or item name is chosen by
// other people), so those get a leading apostrophe; numbers are written as they are.
function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
module.exports = { toCsv, csvCell };
