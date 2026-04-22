function generate(w, h, baseRadius, maxEdgeWidth) {
  const canvas = document.createElement("canvas");
  const scale = 0.5;
  const cw = Math.ceil(w * scale);
  const ch = Math.ceil(h * scale);
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(cw, ch);
  const data = imgData.data;

  function sdf(x, y) {
    const dx = Math.abs(x - cw / 2.0);
    const dy = Math.abs(y - ch / 2.0);
    const ex = cw / 2.0 - baseRadius * scale;
    const ey = ch / 2.0 - baseRadius * scale;
    const qx = dx - ex;
    const qy = dy - ey;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - baseRadius * scale;
  }

  for(let y=0; y<ch; y++) {
    for(let x=0; x<cw; x++) {
      const idx = (y * cw + x) * 4;
      
      const d = sdf(x, y); // negative inside, 0 at boundary
      const distToBoundary = -d;

      // if we are far inside (> edgeWidth), no displacement, normal points Z
      let nx = 0, ny = 0;

      // evaluate exact q for thickness
      const dx = Math.abs(x - cw / 2.0);
      const dy = Math.abs(y - ch / 2.0);
      const ex = cw / 2.0 - baseRadius * scale;
      const ey = ch / 2.0 - baseRadius * scale;
      const qx = dx - ex;
      const qy = dy - ey;
      const cornerFactor = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      // edge width goes from 3 up to 14
      const ew = (3.0 + (cornerFactor / (baseRadius * scale)) * 11.0) * scale;
      
      if (distToBoundary >= 0 && distToBoundary <= ew) {
        // Gradient of SDF
        const epsilon = 0.1;
        const gx = sdf(x + epsilon, y) - sdf(x - epsilon, y);
        const gy = sdf(x, y + epsilon) - sdf(x, y - epsilon);
        let len = Math.hypot(gx, gy);
        if(len > 0) {
            nx = gx / len;
            ny = gy / len;
            
            // meniscus shape: it's a curve from 0 to ew.
            // profile is a half-ellipse or sine wave.
            const t = distToBoundary / ew; // 0 at edge, 1 at inner boundary
            // We want maximum displacement somewhat in the middle of the edge thickness?
            // Or a constant push?
            // "根绝有一条中线被拉长", so the normal shifts direction across the centerline!
            // Meniscus model: outer half pushes outwards, inner half pushes inwards!
            // Or just a single convex curve: Derivative of height. Height = sin(t * pi).
            // Gradient of height ~ cos(t * pi).
            // So displacement magnitude ~ cos(t * pi).
            const magnitude = Math.cos(t * Math.PI);
            
            nx *= magnitude;
            ny *= magnitude;
        }
      }

      data[idx] = Math.ceil((nx * 0.5 + 0.5) * 255);
      data[idx+1] = Math.ceil((ny * 0.5 + 0.5) * 255);
      data[idx+2] = 255; // Blue channel not used by X/Y displacement, but 255 is fine.
      data[idx+3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

console.log("Length for 680x150:", generate(680, 150, 24, 14).length, "bytes");
