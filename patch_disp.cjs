const fs = require('fs');
const content = fs.readFileSync('client/src/App.tsx', 'utf-8');
const newContent = content.replace(
`          // Mapping disp to RGB channels (0 to 1) for the SVG DisplacementMap.
          // Note: WebGL's Y axis points UP, but SVG's Y axis points DOWN. 
          // So we MUST invert disp.y here to ensure top/bottom edges pull inwards correctly instead of folding outward!
          vec2 colorData = clamp(vec2(disp.x, -disp.y) * 0.5 + 0.5, 0.0, 1.0);`,
`          // Mapping disp to RGB channels (0 to 1) for the SVG DisplacementMap.
          // Invert both X and Y.
          vec2 colorData = clamp(vec2(-disp.x, -disp.y) * 0.5 + 0.5, 0.0, 1.0);`);
fs.writeFileSync('client/src/App.tsx', newContent);
