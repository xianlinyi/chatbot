const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

// Fix disp scaling and sign
content = content.replace(
  /disp = -normal \* amplitude \* \(currentEdgeWidth \/ 24\.0\);\s*\}/g,
  'disp = vec2(-normal.x, normal.y) * amplitude * 1.0;\n          }'
);

content = content.replace(
  /vec2 colorData = clamp\(vec2\(-disp\.x, -disp\.y\) \* 0\.5 \+ 0\.5, 0\.0, 1\.0\);/g,
  'vec2 colorData = clamp(vec2(disp.x, disp.y) * 0.5 + 0.5, 0.0, 1.0);'
);

fs.writeFileSync('client/src/App.tsx', content);
