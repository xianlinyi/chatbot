const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const oldFilter = `<feDisplacementMap in="redSrc" in2="edgeNoise" scale="26" xChannelSelector="R" yChannelSelector="G" result="redDisp"/>
          <feDisplacementMap in="greenSrc" in2="edgeNoise" scale="24" xChannelSelector="R" yChannelSelector="G" result="greenDisp"/>
          <feDisplacementMap in="blueSrc" in2="edgeNoise" scale="22" xChannelSelector="R" yChannelSelector="G" result="blueDisp"/>`;

const newFilter = ` {/* 放大 scale 值：SVG位移的最大偏移量是 scale * 0.5。要想拉伸完整跨越 24px 边框，scale 至少需要是 48 */}
          <feDisplacementMap in="redSrc" in2="edgeNoise" scale="64" xChannelSelector="R" yChannelSelector="G" result="redDisp"/>
          <feDisplacementMap in="greenSrc" in2="edgeNoise" scale="60" xChannelSelector="R" yChannelSelector="G" result="greenDisp"/>
          <feDisplacementMap in="blueSrc" in2="edgeNoise" scale="56" xChannelSelector="R" yChannelSelector="G" result="blueDisp"/>`;

content = content.replace(oldFilter, newFilter);

const oldShader = `          if (q.x > 0.0 && q.y > 0.0) {
              normal = normalize(q) * signP;
          } else if (q.x > q.y) {`;

const newShader = `          if (q.x > 0.0 && q.y > 0.0) {
              // 增强拐角处的法线向量长度，补偿 normalize 导致的 0.707 衰减
              // 使对角线方向的形变拉扯力度恢复甚至超过直边，达到更强烈的张力
              vec2 n = normalize(q);
              float cornerBoost = 1.0 + 0.8 * (2.0 * n.x * n.y); // 在 45 度角时大幅增强
              normal = n * signP * cornerBoost;
          } else if (q.x > q.y) {`;

content = content.replace(oldShader, newShader);

fs.writeFileSync('client/src/App.tsx', content);
