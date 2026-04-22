const fs = require('fs');
let content = fs.readFileSync('client/src/App.tsx', 'utf-8');

const oldFilter = `{/* 结合上下扩展到 24px，恢复 scale="24" 以维持最大拉伸比例（disp内部已按宽度自行衰减限制） */}
          <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale="24" xChannelSelector="R" yChannelSelector="G" />`;

const newFilter = `{/* 提取 R, G, B 三个通道分别进行位移，创造色散边缘透镜效果 */}
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="redSrc"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="greenSrc"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" in="SourceGraphic" result="blueSrc"/>

          {/* 三个通道赋予略微不同的 scale，模仿不同波长光线的折射率差 */}
          <feDisplacementMap in="redSrc" in2="edgeNoise" scale="26" xChannelSelector="R" yChannelSelector="G" result="redDisp"/>
          <feDisplacementMap in="greenSrc" in2="edgeNoise" scale="24" xChannelSelector="R" yChannelSelector="G" result="greenDisp"/>
          <feDisplacementMap in="blueSrc" in2="edgeNoise" scale="22" xChannelSelector="R" yChannelSelector="G" result="blueDisp"/>

          {/* 将三通道利用 Screen Blend 重新合并成全彩画面 */}
          <feBlend mode="screen" in="redDisp" in2="greenDisp" result="rgDisp"/>
          <feBlend mode="screen" in="rgDisp" in2="blueDisp" result="rgbDisp"/>`;

content = content.replace(oldFilter, newFilter);
fs.writeFileSync('client/src/App.tsx', content);
