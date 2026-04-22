const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

content = content.replace(
  /float amplitude = \(1\.0 - t\) \* \(1\.0 - t\);/,
  'float amplitude = (1.0 - t) * (1.0 - t);\n              disp = vec2(-normal.x, normal.y) * amplitude;'
);
content = content.replace(
  /float dx = -normal\.x;\s*\n\s*float dy = normal\.y;\s*\n\s*vec2 colorData = vec2\(0\.5 \+ dx \* amplitude \* 0\.5, 0\.5 \+ dy \* amplitude \* 0\.5\);/g,
  'vec2 colorData = vec2(0.5 + disp.x * 0.5, 0.5 + disp.y * 0.5);'
);

fs.writeFileSync('client/src/App.tsx', content);
