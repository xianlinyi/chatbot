const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

content = content.replace(
  /vec2 colorData = clamp\(vec2\(disp\.x, -disp\.y\) \* 0\.5 \+ 0\.5, 0\.0, 1\.0\);\s*gl_FragColor = vec4\(colorData, 0\.5, 1\.0\);/,
  `// 绝不混淆双轴向极性！
          // SVG 坐标系：X朝右，Y朝下
          // R通道控制 X轴偏移 (R>0.5抓取右侧，R<0.5抓取左侧)
          // G通道控制 Y轴偏移 (G>0.5抓取下侧，G<0.5抓取上侧)
          // normal 表示朝向边框外侧的法向量。
          // 想把内部像素拉向外侧，必须让位移坐标反方向指向内部：
          float dx = -normal.x; // 右边(>0)时 dx < 0 (抓左侧)
          float dy = normal.y;  // 上边(>0)在 DOM属于Y=0, 想抓下侧(内部), 需要 dy > 0, 故取 +normal.y
          
          vec2 colorData = vec2(0.5 + dx * amplitude * 0.5, 0.5 + dy * amplitude * 0.5);
          gl_FragColor = vec4(clamp(colorData, 0.0, 1.0), 0.5, 1.0);`
);
fs.writeFileSync('client/src/App.tsx', content);
