const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const newShader = `        precision highp float;

        varying vec2 vUv;
        uniform vec2 uResolution;

        void main() {
          vec2 pixelCoord = vUv * uResolution;
          vec2 center = uResolution * 0.5;
          vec2 d = abs(pixelCoord - center);
          vec2 extents = center - vec2(24.0);
          vec2 q = d - extents;
          
          float distOutside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float distToBoundary = 24.0 - distOutside;
          
          vec2 centeredP = pixelCoord - center; 
          vec2 signP = sign(centeredP);
          // safeguard signs against exact zero
          if(signP.x == 0.0) signP.x = 1.0;
          if(signP.y == 0.0) signP.y = 1.0;
          
          vec2 normal = vec2(0.0);
          if (q.x > 0.0 && q.y > 0.0) {
              normal = normalize(q) * signP;
          } else if (q.x > q.y) {
              normal = vec2(1.0, 0.0) * signP;
          } else {
              normal = vec2(0.0, 1.0) * signP;
          }
          
          vec2 disp = vec2(0.0);
          float currentEdgeWidth = 24.0;

          if (distToBoundary >= 0.0 && distToBoundary <= currentEdgeWidth) {
              float t = distToBoundary / currentEdgeWidth;
              float amplitude = (1.0 - t) * (1.0 - t);
              
              // To stretch the content outwards, we want to fetch pixels from the inside.
              // WebGL -> SVG Map:
              //   dx > 0 means sample from Right. (Needs DX>0 on left side, DX<0 on right side).
              //   dy > 0 means sample from Down. (Needs DY>0 on top side, DY<0 on bottom side).
              // Since normal points outwards, we simply use -normal.x for DX, and +normal.y for DY.
              // (Because WebGL Y+ is Top, but SVG Top needs DY>0 to sample from inside/down).
              disp.x = -normal.x * amplitude;
              disp.y = normal.y * amplitude; 
          }
          
          vec2 colorData = vec2(0.5 + disp.x * 0.5, 0.5 + disp.y * 0.5);
          gl_FragColor = vec4(clamp(colorData, 0.0, 1.0), 0.5, 1.0);
        }`;

content = content.replace(/fragmentShader:\s*`[\s\S]*?`\s*}\);/, 'fragmentShader: `\n' + newShader + '\n`\n    });');
fs.writeFileSync('client/src/App.tsx', content);
