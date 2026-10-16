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

// The zoom factor for a window whose content area is contentW x contentH (DIP): 1 while the design fits, smaller below it. It is rounded
// DOWN to 1/100 so the page is never a pixel narrower than the design (a rounded-up factor cuts the last pixels off the right edge).
function fitZoom(contentW, contentH, design) {
  if (!(contentW > 0) || !(contentH > 0)) return 1;
  const wanted = Math.min(1, contentW / design.w, contentH / design.h);
  return Math.floor(Math.max(FLOOR_ZOOM, wanted) * 100) / 100;
}

module.exports = { DESIGN, MIN_ZOOM, FLOOR_ZOOM, minWindow, fitZoom };
