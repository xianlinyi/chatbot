const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

content = content.replace(
  /vec2 signP = sign\(centeredP\);\s*vec2 normal = vec2\(0\.0\);/,
  `vec2 signP = sign(centeredP);
          if(signP.x == 0.0) signP.x = 1.0;
          if(signP.y == 0.0) signP.y = 1.0;
          
          vec2 normal = vec2(0.0);`
);
fs.writeFileSync('client/src/App.tsx', content);
