const fs = require('fs');

function generate(w, h, R, minW, maxW) {
  const scale = 0.5;
  const cw = Math.ceil(w * scale);
  const ch = Math.ceil(h * scale);
  
  // SVG based normal map!
  // Wait, if it's SVG, we can't easily draw the SDF.
  // We really have to use Canvas, and Node doesn't have it.
}
