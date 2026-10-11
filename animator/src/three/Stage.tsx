import React, { useLayoutEffect, useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { random, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";

export type Vec3 = [number, number, number];

export const RENDER_SCALE = 2 / 3;
export type Shot = { pos: Vec3; target: Vec3; fov?: number };
export type TimeOfDay = "day" | "sunset" | "night" | "dawn" | "storm";

export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Deterministic 2D value noise + fractal sum, so terrain is identical on every render worker. */
const hash = (x: number, y: number, seed: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
export const noise2 = (x: number, y: number, seed = 1) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
};
export const fbm = (x: number, y: number, seed = 1, oct = 5) => {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise2(x * f, y * f, seed + i); f *= 2; amp *= 0.5; }
  return v;
};

/** Camera moves, all expressed around a subject of radius r centred at the origin. */
export const shotFor = (kind: string | undefined, t: number, r: number, height = r * 0.5): Shot => {
  const e = smooth(t);
  const tgt: Vec3 = [0, height, 0];
  switch (kind) {
    case "dolly": {
      const d = lerp(r * 4.2, r * 2.1, e);
      return { pos: [d * 0.55, height + r * lerp(0.9, 0.35, e), d * 0.83], target: tgt };
    }
    case "flyover": {
      const x = lerp(-r * 3.2, r * 3.2, t);
      return { pos: [x, r * 1.9, r * 2.4], target: [x * 0.25, height * 0.6, 0] };
    }
    case "rise": {
      return { pos: [r * 0.4, lerp(r * 0.12, r * 2.6, e), lerp(r * 3.4, r * 2.4, e)], target: [0, lerp(height * 1.3, height * 0.6, e), 0] };
    }
    case "push": {
      const d = lerp(r * 3.4, r * 2.5, t);
      return { pos: [r * 0.9, height + r * 0.25, d], target: tgt };
    }
    case "orbit":
    default: {
      const a = lerp(-0.7, 0.9, t);
      const d = r * 3.0;
      return { pos: [Math.sin(a) * d, height + r * 0.75, Math.cos(a) * d], target: tgt };
    }
  }
};

const CameraRig: React.FC<{ shot: Shot }> = ({ shot }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(...shot.pos);
    camera.lookAt(...shot.target);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera && shot.fov) {
      (camera as THREE.PerspectiveCamera).fov = shot.fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  }, [camera, shot]);
  return null;
};

export const LIGHT: Record<TimeOfDay, { sky: [string, string]; sun: string; sunI: number; amb: string; ambI: number; sunPos: Vec3; fog: string }> = {
  day: { sky: ["#7fb6e6", "#d9ecf7"], sun: "#fff4e0", sunI: 2.6, amb: "#bcd3ff", ambI: 0.9, sunPos: [30, 40, 20], fog: "#cfe3f1" },
  sunset: { sky: ["#3b2a5a", "#ff9a4a"], sun: "#ffc890", sunI: 2.8, amb: "#c09aa8", ambI: 1.1, sunPos: [-40, 10, -20], fog: "#d98a62" },
  dawn: { sky: ["#4a6fa5", "#ffcf9e"], sun: "#ffe0b8", sunI: 1.9, amb: "#9fb2d8", ambI: 0.8, sunPos: [40, 12, -30], fog: "#e3c1a8" },
  night: { sky: ["#02040c", "#13234a"], sun: "#9fb8ff", sunI: 1.4, amb: "#5a6a9a", ambI: 0.95, sunPos: [-20, 30, 10], fog: "#0b1530" },
  storm: { sky: ["#1d2329", "#58636e"], sun: "#c9d3dc", sunI: 1.0, amb: "#7d8996", ambI: 0.8, sunPos: [10, 30, 10], fog: "#4a545e" },
};

const gradientTexture = (top: string, bottom: string) => {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

let DOT: THREE.Texture | null = null;
/** Soft round sprite so particles aren't drawn as squares. */
const dot = () => {
  if (DOT) return DOT;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.6)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  DOT = new THREE.CanvasTexture(c);
  return DOT;
};

/** Particle effects: deterministic positions from the frame number. */
export const Particles: React.FC<{ effect?: string; r: number; origin?: Vec3 }> = ({ effect, r, origin = [0, 0, 0] }) => {
  const frame = useCurrentFrame();
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  if (!effect || effect === "none" || effect === "fog") return null;
  const n = effect === "stars" ? 900 : effect === "rain" ? 1400 : 500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const rx = random(`px${i}`), ry = random(`py${i}`), rz = random(`pz${i}`), sp = 0.5 + random(`ps${i}`);
    let x = (rx - 0.5) * r * 6, y = ry * r * 3, z = (rz - 0.5) * r * 6;
    if (effect === "rain") y = r * 3 - ((ry * r * 3 + frame * 0.9 * sp * r * 0.08) % (r * 3));
    if (effect === "snow" || effect === "dust") {
      y = r * 3 - ((ry * r * 3 + frame * 0.012 * sp * r) % (r * 3));
      x += Math.sin(frame / 30 + i) * r * 0.05;
    }
    if (effect === "smoke" || effect === "embers") {
      const life = ((frame * 0.006 * sp + ry) % 1);
      const spread = effect === "smoke" ? 0.9 : 0.5;
      x = origin[0] + (rx - 0.5) * r * spread * (0.2 + life * 2);
      z = origin[2] + (rz - 0.5) * r * spread * (0.2 + life * 2);
      y = origin[1] + life * r * (effect === "smoke" ? 2.4 : 1.8);
    }
    if (effect === "stars") {
      const th = rx * Math.PI * 2, ph = Math.acos(ry * 0.9 + 0.1);
      x = Math.cos(th) * Math.sin(ph) * r * 30; y = Math.cos(ph) * r * 30; z = Math.sin(th) * Math.sin(ph) * r * 30;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const style: Record<string, { color: string; size: number; opacity: number; add?: boolean }> = {
    rain: { color: "#b8c8d8", size: r * 0.02, opacity: 0.55 },
    snow: { color: "#ffffff", size: r * 0.035, opacity: 0.9 },
    dust: { color: "#e8c88a", size: r * 0.02, opacity: 0.5 },
    smoke: { color: "#8a817a", size: r * 0.6, opacity: 0.28 },
    embers: { color: "#ffae3b", size: r * 0.045, opacity: 0.95, add: true },
    stars: { color: "#ffffff", size: r * 0.12, opacity: 0.9 },
  };
  const s = style[effect] ?? style.dust;
  return (
    <points geometry={geo}>
      <pointsMaterial color={s.color} size={s.size} map={dot()} alphaTest={0.01} transparent opacity={s.opacity} depthWrite={false}
        blending={s.add ? THREE.AdditiveBlending : THREE.NormalBlending} sizeAttenuation />
    </points>
  );
};

/**
 * A lit 3D stage: sky dome, sun + ambient light, fog and a camera on a scripted path.
 * Everything is recomputed from the frame number, so any frame can be rendered on its own.
 */
export const Stage: React.FC<{
  shot: Shot;
  time?: TimeOfDay;
  fogNear?: number;
  fogFar?: number;
  children: React.ReactNode;
}> = ({ shot, time = "day", fogNear = 40, fogFar = 160, children }) => {
  const { width, height } = useVideoConfig();
  const L = LIGHT[time] ?? LIGHT.day;
  // Software WebGL on CI is slow, so 3D is drawn at 2/3 size and scaled up; no shadow maps.
  const q = RENDER_SCALE;
  const sky = useMemo(() => gradientTexture(L.sky[0], L.sky[1]), [L.sky[0], L.sky[1]]);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: width * q, height: height * q, transform: `scale(${1 / q})`, transformOrigin: "0 0" }}>
    <ThreeCanvas width={Math.round(width * q)} height={Math.round(height * q)} camera={{ fov: shot.fov ?? 45, near: 0.1, far: 2000, position: shot.pos }}
      gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={1}>
      <CameraRig shot={shot} />
      <primitive object={sky} attach="background" />
      <fog attach="fog" args={[L.fog, fogNear, fogFar]} />
      <ambientLight color={L.amb} intensity={L.ambI} />
      <hemisphereLight args={[L.sky[1], T.ocean, 0.5]} />
      <directionalLight color={L.sun} intensity={L.sunI} position={L.sunPos} />
      {children}
    </ThreeCanvas>
    </div>
  );
};
