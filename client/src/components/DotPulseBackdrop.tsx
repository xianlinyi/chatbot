import { useEffect, useRef } from "react";

type DotWaveProps = {
  cxOffset: number;
  cyOffset: number;
  angX: number;
  angY: number;
  speedRad: number;
  speedX: number;
  speedY: number;
};

const DOT_WAVE_FADE_RATE = 0.0008;
const DOT_WAVE_CYCLE_MS = 2800;
const DOT_GRID_SIZE = 12;
const DOT_BASE_ALPHA = 0.12;
const DOT_BOTTOM_FADE_HEIGHT = 96;
const DOT_COMPOSER_CLEARANCE = 18;
const DOT_TOP_FADE_HEIGHT = 150;

function createDotWaveProps(): DotWaveProps {
  const initialAngle = Math.random() * Math.PI * 2;

  return {
    cxOffset: (Math.random() - 0.5) * 200,
    cyOffset: (Math.random() - 0.5) * 200,
    angX: Math.cos(initialAngle) * 0.012,
    angY: Math.sin(initialAngle) * 0.012,
    speedRad: 1.0 + (Math.random() - 0.5) * 0.4,
    speedX: 0.8 + (Math.random() - 0.5) * 0.3,
    speedY: 0.9 + (Math.random() - 0.5) * 0.3
  };
}

export function DotPulseBackdrop({ isActive, isDarkMode }: { isActive: boolean; isDarkMode: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globalAlphaRef = useRef(0);
  const wavePropsRef = useRef<DotWaveProps>(createDotWaveProps());
  const waveStartedAtRef = useRef(0);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let frameId = 0;
    let width = 0;
    let height = 0;
    let lastTime = performance.now();

    const now = performance.now();

    if (isActive && !wasActiveRef.current) {
      wavePropsRef.current = createDotWaveProps();
      waveStartedAtRef.current = now;
    }

    if (isActive) {
      if (waveStartedAtRef.current === 0) {
        waveStartedAtRef.current = now;
      }
    }
    wasActiveRef.current = isActive;

    const draw = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      const waveProps = wavePropsRef.current;

      if (isActive && !prefersReducedMotion) {
        globalAlphaRef.current = Math.min(1, globalAlphaRef.current + dt * DOT_WAVE_FADE_RATE);
      } else {
        globalAlphaRef.current = Math.max(0, globalAlphaRef.current - dt * DOT_WAVE_FADE_RATE);
      }

      context.clearRect(0, 0, width, height);

      const time = ((now - waveStartedAtRef.current) / DOT_WAVE_CYCLE_MS) * Math.PI * 2;
      const columns = Math.ceil(width / DOT_GRID_SIZE);
      const rows = Math.ceil(height / DOT_GRID_SIZE);
      const cx = width / 2 + waveProps.cxOffset;
      const cy = height / 2 + waveProps.cyOffset;
      const colorRGB = isDarkMode ? "255, 255, 255" : "0, 0, 0";
      const waveAlpha = prefersReducedMotion ? 0 : globalAlphaRef.current;
      const centerX = width / 2;
      const centerY = height / 2;
      const bottomFadeStart = Math.max(0, height - DOT_COMPOSER_CLEARANCE - DOT_BOTTOM_FADE_HEIGHT);
      const bottomFadeEnd = Math.max(0, height - DOT_COMPOSER_CLEARANCE);

      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) {
          const baseX = i * DOT_GRID_SIZE;
          const baseY = j * DOT_GRID_SIZE;

          const horizontalDistance = Math.abs(baseX - centerX) / Math.max(centerX, 1);
          const verticalDistance = Math.abs(baseY - centerY) / Math.max(centerY, 1);
          const centerDistance = Math.sqrt(horizontalDistance * horizontalDistance * 0.42 + verticalDistance * verticalDistance);
          const radialFade = Math.pow(Math.max(0, 1 - centerDistance), 0.92);
          let verticalFade = 1;
          if (baseY < DOT_TOP_FADE_HEIGHT) {
            verticalFade = Math.max(0, baseY / DOT_TOP_FADE_HEIGHT);
          } else if (baseY > bottomFadeStart) {
            verticalFade = Math.max(0, 1 - (baseY - bottomFadeStart) / Math.max(1, bottomFadeEnd - bottomFadeStart));
          }
          verticalFade *= radialFade;
          if (verticalFade <= 0.01) continue;

          const dx = baseX - cx;
          const dy = baseY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radialWave = Math.sin(dist * 0.015 - time * waveProps.speedRad);
          const dirWave1 = Math.sin(dx * waveProps.angX + dy * waveProps.angY + time * waveProps.speedX);
          const dirWave2 = Math.cos(dx * waveProps.angY - dy * waveProps.angX + time * waveProps.speedY);
          const z = radialWave + (dirWave1 + dirWave2) * 0.5;
          const normalizedZ = Math.max(0, Math.min(1, (z + 0.2) / 2.2));
          const lift = z < -0.2 ? 0 : normalizedZ;
          const waveAmount = waveAlpha * Math.pow(lift, 1.5);
          const maxAlpha = isDarkMode ? 0.4 : 0.25;
          const alpha = (DOT_BASE_ALPHA + (maxAlpha - DOT_BASE_ALPHA) * waveAmount) * verticalFade;
          const radius = (1 + lift * 1.5 * waveAlpha) * verticalFade;

          context.beginPath();
          context.arc(baseX, baseY - lift * 4 * waveAlpha, Math.max(0.1, radius), 0, Math.PI * 2);
          context.fillStyle = `rgba(${colorRGB}, ${alpha.toFixed(3)})`;
          context.fill();
        }
      }

      if (isActive || globalAlphaRef.current > 0) {
        frameId = window.requestAnimationFrame(draw);
      } else {
        frameId = 0;
      }
    };

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (!frameId) {
        draw(performance.now());
      }
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [isActive, isDarkMode]);

  return <canvas aria-hidden="true" className="dot-pulse-backdrop" ref={canvasRef} />;
}
