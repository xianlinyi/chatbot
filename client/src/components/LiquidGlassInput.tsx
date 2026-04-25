import { ComponentPropsWithoutRef, CSSProperties, ReactNode, useEffect, useId, useRef, useState } from "react";
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";
import "./LiquidGlassInput.css";

type LiquidGlassInputProps = Omit<ComponentPropsWithoutRef<"form">, "children"> & {
  children: ReactNode;
  hasText: boolean;
  isActive: boolean;
  isDarkMode: boolean;
  isEditable?: boolean;
};

export function LiquidGlassInput({
  children,
  className = "",
  hasText,
  isActive,
  isDarkMode,
  isEditable = true,
  style,
  ...formProps
}: LiquidGlassInputProps) {
  const rawFilterId = useId();
  const filterId = `liquid-glass-${rawFilterId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [displacementMapUrl, setDisplacementMapUrl] = useState("");
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const previousUrl = displacementMapUrl;

    return () => {
      if (previousUrl && previousUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previousUrl);
      }
    };
  }, [displacementMapUrl]);

  const formStyle = {
    ...style,
    "--liquid-glass-filter": `url("#${filterId}")`
  } as CSSProperties & Record<"--liquid-glass-filter", string>;

  return (
    <form
      {...formProps}
      className={[
        "liquid-glass-input",
        hasText ? "liquid-glass-input-filled" : "liquid-glass-input-empty",
        isEditable ? "liquid-glass-input-editable" : "liquid-glass-input-disabled",
        className
      ].filter(Boolean).join(" ")}
      style={formStyle}
    >
      <svg aria-hidden="true" className="liquid-glass-filter-defs" focusable="false">
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          {displacementMapUrl && surfaceSize.width > 0 ? (
            <feImage
              href={displacementMapUrl}
              result="edgeNoise"
              preserveAspectRatio="none"
              x="0"
              y="0"
              width={surfaceSize.width}
              height={surfaceSize.height}
              crossOrigin="anonymous"
            />
          ) : (
            <feTurbulence baseFrequency="0.012 0.036" numOctaves="1" result="edgeNoise" seed="12" type="fractalNoise" />
          )}

          <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="redSrc" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" in="SourceGraphic" result="greenSrc" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" in="SourceGraphic" result="blueSrc" />

          <feDisplacementMap in="redSrc" in2="edgeNoise" scale="64" xChannelSelector="R" yChannelSelector="G" result="redDisp" />
          <feDisplacementMap in="greenSrc" in2="edgeNoise" scale="60" xChannelSelector="R" yChannelSelector="G" result="greenDisp" />
          <feDisplacementMap in="blueSrc" in2="edgeNoise" scale="56" xChannelSelector="R" yChannelSelector="G" result="blueDisp" />

          <feBlend mode="screen" in="redDisp" in2="greenDisp" result="rgDisp" />
          <feBlend mode="screen" in="rgDisp" in2="blueDisp" result="rgbDisp" />
        </filter>
      </svg>
      <LiquidGlassSurface
        hasText={hasText}
        isActive={isActive}
        isDarkMode={isDarkMode}
        onDisplacementUpdate={setDisplacementMapUrl}
        onSizeUpdate={setSurfaceSize}
      />
      {children}
    </form>
  );
}

function LiquidGlassSurface({
  hasText,
  isActive,
  isDarkMode,
  onDisplacementUpdate,
  onSizeUpdate
}: {
  hasText: boolean;
  isActive: boolean;
  isDarkMode: boolean;
  onDisplacementUpdate: (url: string) => void;
  onSizeUpdate: ({ width, height }: { width: number; height: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformsRef = useRef<{
    uActive: { value: number };
    uDark: { value: number };
    uHasText: { value: number };
    uPointer: { value: Vector2 };
  } | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas?.parentElement;

    if (
      !canvas ||
      !surface ||
      typeof WebGLRenderingContext === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const uniforms = {
      uActive: { value: isActive ? 1 : 0 },
      uDark: { value: isDarkMode ? 1 : 0 },
      uHasText: { value: hasText ? 1 : 0 },
      uPointer: { value: new Vector2(0.72, 0.36) },
      uResolution: { value: new Vector2(1, 1) },
      uTime: { value: 0 }
    };

    let renderer: WebGLRenderer;
    let frameId = 0;

    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
    } catch {
      return;
    }

    uniformsRef.current = uniforms;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms,
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;

        uniform float uActive;
        uniform float uDark;
        uniform float uHasText;
        uniform float uTime;
        uniform vec2 uPointer;
        uniform vec2 uResolution;

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
          vec2 p = (uv - 0.5) * aspect;
          vec2 pointer = (uPointer - 0.5) * aspect;

          float distToPointer = length(p - pointer);
          vec2 pixelCoord = uv * uResolution;
          vec2 center = uResolution * 0.5;
          vec2 d = abs(pixelCoord - center);
          vec2 extents = center - vec2(24.0);
          vec2 q = d - extents;

          float cornerFactor = clamp(max(q.x, 0.0) * max(q.y, 0.0) / 288.0, 0.0, 1.0);
          float distToBoundary = 24.0 - (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));

          vec2 signP = sign(pixelCoord - center);
          vec2 normal = vec2(0.0);
          if (q.x > 0.0 && q.y > 0.0) {
              normal = normalize(q) * signP;
          } else if (q.x > q.y) {
              normal = vec2(1.0, 0.0) * signP;
          } else {
              normal = vec2(0.0, 1.0) * signP;
          }

          float currentEdgeWidth = 24.0;
          float edgeMask = cos(clamp(distToBoundary / currentEdgeWidth, 0.0, 1.0) * 1.5707963);

          vec3 baseColor = vec3(1.0);
          float alpha = 0.05 * edgeMask;
          if (uDark > 0.5) {
            alpha = 0.0;
          }

          gl_FragColor = vec4(baseColor, alpha);
        }
      `
    });

    const normalMaterial = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms,
      vertexShader: material.vertexShader,
      fragmentShader: `
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
              float amplitude = 0.35 * (1.0 - t);
              disp = vec2(-normal.x, normal.y) * amplitude;
          }

          vec2 colorData = clamp(vec2(disp.x, disp.y) * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(colorData, 0.5, 1.0);
        }
      `
    });

    const mesh = new Mesh(new PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const renderSurface = () => {
      renderer.render(scene, camera);
      frameId = 0;
    };

    const scheduleRender = () => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(renderSurface);
      }
    };

    const resize = () => {
      const { height, width } = surface.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      renderer.setSize(nextWidth, nextHeight, false);
      uniforms.uResolution.value.set(nextWidth, nextHeight);
      onSizeUpdate({ width: nextWidth, height: nextHeight });

      mesh.material = normalMaterial;
      renderer.render(scene, camera);
      canvas.toBlob((blob) => {
        if (blob) {
          onDisplacementUpdate(URL.createObjectURL(blob));
        }
      }, "image/png");
      mesh.material = material;
      scheduleRender();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = surface.getBoundingClientRect();
      uniforms.uPointer.value.set(
        (event.clientX - bounds.left) / Math.max(bounds.width, 1),
        1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)
      );
      scheduleRender();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);
    window.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("liquid-glass-render", scheduleRender);
    resize();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("liquid-glass-render", scheduleRender);
      resizeObserver.disconnect();
      material.dispose();
      normalMaterial.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
      uniformsRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!uniformsRef.current) {
      return;
    }

    uniformsRef.current.uActive.value = isActive ? 1 : 0;
    uniformsRef.current.uDark.value = isDarkMode ? 1 : 0;
    uniformsRef.current.uHasText.value = hasText ? 1 : 0;

    const canvas = canvasRef.current;
    canvas?.dispatchEvent(new Event("liquid-glass-render"));
  }, [hasText, isActive, isDarkMode]);

  return <canvas aria-hidden="true" className="liquid-glass-canvas" ref={canvasRef} />;
}
