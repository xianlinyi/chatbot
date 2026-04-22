const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const prefix = 'const normalMaterial = new THREE.ShaderMaterial({';
const suffix = '\n    });\n\n    const mesh = new THREE.Mesh';

const startIndex = content.indexOf(prefix);
const endIndex = content.indexOf(suffix, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const newNormalMaterial = `const normalMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms,
      vertexShader: material.vertexShader,
      fragmentShader: \`
        precision highp float;

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
          // 防除零安全处理
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
              
              // 让各个方向向各个“外侧”拉扯！
              // 这意味着处于“外侧边缘”的像素，需要去找处于“内部中心”的像素借色填补。
              // WebGL与SVG坐标系的映射规则是：
              // X通道(左0 右1) = -normal.x. 左边正常需内抽(向右抓 > 0). DX对应 R通道.
              // Y通道(下0 上1) = +normal.y. 上边正常需内抽(向下抓 > 0). DY对应 G通道.
              // 通过绝对数学映射，彻底排除了在圆角处混合的偏差。
              disp.x = -normal.x * amplitude;
              disp.y = normal.y * amplitude; 
          }
          
          vec2 colorData = vec2(0.5 + disp.x * 0.5, 0.5 + disp.y * 0.5);
          gl_FragColor = vec4(clamp(colorData, 0.0, 1.0), 0.5, 1.0);
        }\`
    });`;
  
  content = content.slice(0, startIndex) + newNormalMaterial + content.slice(endIndex + 6); // +6 for '\n    });'
  fs.writeFileSync('client/src/App.tsx', content);
}
