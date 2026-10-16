'use strict';
// Window fit. The layout is built for a window of at least DESIGN (CSS pixels). A smaller window does not squeeze it any further, which
// pushed buttons off the edge: the page is zoomed out as a whole instead, so every control keeps its shape and its proportions.
// MIN_ZOOM is how far that goes; the smallest window the app allows follows from it.
const DESIGN = { dash: { w: 900, h: 560 }, login: { w: 900, h: 640 } };
const MIN_ZOOM = 0.75;
// The zoom may go a little below MIN_ZOOM: the system lets a frameless window get a few pixels smaller than the minimum we ask for
// (884 x 552 for a 900 x 560 minimum), and the page must still fit there.
const FLOOR_ZOOM = 0.65;

// The smallest window (DIP) for a design size.
function minWindow(design) {
  return { w: Math.ceil(design.w * MIN_ZOOM), h: Math.ceil(design.h * MIN_ZOOM) };
}

// The interface scale the user can pick (percent). 100 is the size the layout was drawn for; a bigger one is only used while the window is
// big enough to hold the design at that size, otherwise the fit below wins.
const SCALES = [80, 90, 100, 110, 125, 150];

// Anything that is not one of the steps (an old or hand-edited settings file) is 100.
function normalizeScale(value) {
  const n = Number(value);
  return SCALES.includes(n) ? n : 100;
}

// The next step up (dir > 0) or down (dir < 0) from the current one; stays at the ends.
function stepScale(current, dir) {
  const i = SCALES.indexOf(normalizeScale(current));
  return SCALES[Math.max(0, Math.min(SCALES.length - 1, i + (dir > 0 ? 1 : -1)))];
}

// The zoom factor for a window whose content area is contentW x contentH (DIP): the wanted scale while the design fits at it, smaller
// below that. It is rounded DOWN to 1/100 so the page is never a pixel narrower than the design (a rounded-up factor cuts the last
// pixels off the right edge).
function fitZoom(contentW, contentH, design, scalePercent) {
  if (!(contentW > 0) || !(contentH > 0)) return 1;
  const wanted = Math.min(normalizeScale(scalePercent) / 100, contentW / design.w, contentH / design.h);
  return Math.floor(Math.max(FLOOR_ZOOM, wanted) * 100) / 100;
}

module.exports = { DESIGN, MIN_ZOOM, FLOOR_ZOOM, SCALES, minWindow, fitZoom, normalizeScale, stepScale };
