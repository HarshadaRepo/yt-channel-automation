import React, { useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { T } from "../theme";
import { Chip, clamp, usePop, useVertical } from "../common";
import { LIGHT, Particles, Stage, fbm, lerp3, shotFor, smooth, type Shot, type TimeOfDay, type Vec3 } from "../three/Stage";
import { ModelGround, Water, buildModel } from "../three/models";
import type { LonLat, Scene } from "../types";

/** Cards that pop in beside a 3D subject, one after another. */
export const Annotations: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const v = useVertical();
  const notes = scene.annotations ?? [];
  const D = scene.durationInFrames;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {notes.slice(0, 3).map((n, i) => {
        const at = Math.round(D * 0.18 + (i * D * 0.55) / Math.max(1, notes.length));
        const t = interpolate(frame, [at, at + 12], [0, 1], clamp);
        const right = (n.side ?? (i % 2 ? "left" : "right")) === "right";
        const top = v ? 380 + i * 170 : 190 + i * 150;
        return (
          <div key={i} style={{ position: "absolute", top, [right ? "right" : "left"]: v ? 50 : 80, maxWidth: v ? 640 : 560,
            transform: `translateX(${(1 - t) * (right ? 120 : -120)}px)`, opacity: t,
            background: "rgba(8,10,16,0.72)", borderLeft: `8px solid ${T.accent2}`, borderRadius: 12, padding: "14px 22px",
            fontFamily: T.font, fontWeight: 600, fontSize: v ? 44 : 38, color: T.white, boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
            {n.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Big centred label that rises in near the start (e.g. the monument's name). */
const Lower: React.FC<{ text?: string }> = ({ text }) => {
  const pop = usePop(14);
  const v = useVertical();
  if (!text) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: v ? 980 : 760, pointerEvents: "none" }}>
      <div style={{ fontFamily: T.display, fontSize: v ? 96 : 110, color: T.white, letterSpacing: 3, opacity: pop,
        transform: `translateY(${(1 - pop) * 40}px)`, textShadow: "0 6px 30px rgba(0,0,0,0.75)", textAlign: "center", maxWidth: v ? 980 : 1600 }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};

const timeOf = (s: Scene, fallback: TimeOfDay = "day"): TimeOfDay => (s.time as TimeOfDay) ?? fallback;

export const Model3DScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const D = scene.durationInFrames;
  const time = timeOf(scene, scene.model === "volcano" ? "sunset" : "day");
  const built = buildModel(scene.model, frame, time === "night");
  const t = frame / Math.max(1, D);
  const v = useVertical();
  // A tall frame needs the camera further back to fit the subject's width.
  const shot = { ...shotFor(scene.camera ?? "orbit", t, built.r * (v ? 1.55 : 1), built.h), fov: v ? 55 : 45 };
  const effect = scene.effect ?? (scene.model === "volcano" ? "smoke" : time === "night" ? "stars" : undefined);
  return (
    <AbsoluteFill>
      <Stage shot={shot} time={time} fogNear={built.r * 3} fogFar={built.r * 12}>
        <ModelGround built={built} frame={frame} color={T.oceanLight === "#0a4a63" ? "#2a8fb0" : undefined} />
        {built.node}
        <Particles effect={effect} r={built.r} origin={built.vent} />
        {scene.model === "volcano" && <Particles effect="embers" r={built.r} origin={built.vent} />}
      </Stage>
      <Annotations scene={scene} />
      <Lower text={scene.label} />
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

const TERRAIN: Record<string, { amp: number; scale: number; water: number; ramp: [number, string][]; seed: number }> = {
  mountains: { amp: 16, scale: 0.035, water: -1, seed: 2, ramp: [[0, "#4f6b3a"], [0.35, "#6f7d4a"], [0.55, "#7d7466"], [0.75, "#9a948c"], [0.86, "#f4f6f8"]] },
  desert: { amp: 6, scale: 0.03, water: -9, seed: 5, ramp: [[0, "#d9b77a"], [0.5, "#e6c78e"], [0.8, "#c99c5e"]] },
  islands: { amp: 9, scale: 0.04, water: 3.2, seed: 7, ramp: [[0, "#d8c48a"], [0.42, "#4d8a45"], [0.7, "#3a6b35"], [0.9, "#7d7466"]] },
  canyon: { amp: 12, scale: 0.03, water: 0.6, seed: 11, ramp: [[0, "#9a4b2a"], [0.35, "#b8643a"], [0.6, "#cf8a52"], [0.85, "#e0b07a"]] },
  glacier: { amp: 13, scale: 0.035, water: 1.2, seed: 13, ramp: [[0, "#9fb8c9"], [0.3, "#dfeaf2"], [0.6, "#f7fbff"], [0.9, "#ffffff"]] },
  river: { amp: 8, scale: 0.035, water: 1.0, seed: 17, ramp: [[0, "#4a7a3a"], [0.4, "#5f8a45"], [0.7, "#7d8a5a"], [0.9, "#8f8676"]] },
  plains: { amp: 3, scale: 0.03, water: -9, seed: 19, ramp: [[0, "#6f9a45"], [0.5, "#8fae55"], [0.9, "#a9b86a"]] },
};

export const Terrain3DScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const D = scene.durationInFrames;
  const kind = scene.terrain ?? "mountains";
  const cfg = TERRAIN[kind] ?? TERRAIN.mountains;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(200, 200, 140, 140);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      let h = fbm(x * cfg.scale, z * cfg.scale, cfg.seed, 6);
      if (kind === "mountains" || kind === "glacier") h = Math.pow(h, 1.6) * 1.9;
      if (kind === "canyon") h = Math.min(1, 0.35 + Math.abs(Math.sin(z * 0.06 + fbm(x * 0.02, 0, 3) * 4)) * 0.9) * (0.7 + h * 0.6);
      if (kind === "river") h = h * Math.min(1, Math.abs(z - Math.sin(x * 0.05) * 14) / 18);
      const y = h * cfg.amp;
      p.setY(i, y);
      const k = Math.min(0.999, Math.max(0, h));
      let c = cfg.ramp[0][1];
      for (const [at, cc] of cfg.ramp) if (k >= at) c = cc;
      col.set(c);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [kind]);
  const t = frame / Math.max(1, D);
  const e = smooth(t);
  const cam = scene.camera ?? "flyover";
  const shot: Shot =
    cam === "rise"
      ? { pos: [0, 4 + e * 55, 70 - e * 20], target: [0, 4, 0] }
      : cam === "orbit"
        ? { pos: [Math.sin(t * 1.4) * 70, 38, Math.cos(t * 1.4) * 70], target: [0, 4, 0] }
        : { pos: lerp3([-10, cfg.amp * 2.6 + 14, 90], [10, cfg.amp * 2.2 + 12, 10], t), target: lerp3([0, 4, 20], [0, 2, -60], t) };
  const time = timeOf(scene, kind === "glacier" ? "dawn" : "day");
  return (
    <AbsoluteFill>
      <Stage shot={shot} time={time} fogNear={60} fogFar={190}>
        <mesh geometry={geo} receiveShadow castShadow>
          <meshStandardMaterial vertexColors flatShading roughness={0.95} />
        </mesh>
        {cfg.water > -5 && <Water frame={frame} size={200} y={cfg.water} color={kind === "glacier" ? "#4a86a8" : "#2f7f9e"} />}
        <Particles effect={scene.effect ?? (kind === "glacier" ? "snow" : undefined)} r={30} />
      </Stage>
      <Annotations scene={scene} />
      <Lower text={scene.label} />
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

const COUNTRIES: any[] = (feature(world as any, (world as any).objects.countries) as any).features;
const ALIASES: Record<string, string> = { USA: "United States of America", "United States": "United States of America", UK: "United Kingdom" };

/** Equirectangular world texture with highlighted countries and marker labels painted on. */
const useWorldTexture = (scene: Scene) => {
  const [handle] = useState(() => delayRender("globe texture"));
  const tex = useMemo(() => {
    const W = 4096, H = 2048;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    const path = geoPath(proj, g);
    g.fillStyle = "#123a5c"; g.fillRect(0, 0, W, H);
    // Faint graticule.
    g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 2;
    for (let lon = -180; lon <= 180; lon += 15) { const [x] = proj([lon, 0])!; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let lat = -75; lat <= 75; lat += 15) { const [, y] = proj([0, lat])!; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const wanted = new Set((scene.highlight ?? []).map((n) => ALIASES[n] ?? n));
    for (const f of COUNTRIES) {
      g.beginPath(); path(f);
      g.fillStyle = wanted.has(f.properties.name) ? T.accent : T.land; g.fill();
      g.strokeStyle = T.border; g.lineWidth = 1.5; g.stroke();
    }
    for (const m of scene.markers ?? []) {
      const [x, y] = proj(m.lonlat as LonLat)!;
      g.fillStyle = T.accent2; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = T.ink; g.lineWidth = 3; g.stroke();
      g.font = `700 34px ${T.font}`;
      const w = g.measureText(m.label).width;
      g.fillStyle = "rgba(10,12,18,0.82)"; g.fillRect(x + 16, y - 26, w + 20, 46);
      g.fillStyle = "#fff"; g.fillText(m.label, x + 26, y + 9);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [scene]);
  useMemo(() => { document.fonts.ready.then(() => { tex.needsUpdate = true; continueRender(handle); }); }, [tex, handle]);
  return tex;
};

const toVec = (lonlat: LonLat, r: number): THREE.Vector3 => {
  const lon = (lonlat[0] * Math.PI) / 180, lat = (lonlat[1] * Math.PI) / 180;
  // Matches three's SphereGeometry UV layout (u=0 at -180°).
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * r, Math.sin(lat) * r, -Math.cos(lat) * Math.sin(lon) * r);
};

export const Globe3DScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const D = scene.durationInFrames;
  const tex = useWorldTexture(scene);
  const center = (scene.center ?? [0, 20]) as LonLat;
  const from = (scene.rotateFrom ?? [center[0] - 70, center[1] * 0.3]) as LonLat;
  const t = smooth(interpolate(frame, [0, D * 0.6], [0, 1], clamp));
  const drift = interpolate(frame, [D * 0.6, D], [0, 1], clamp);
  const look: LonLat = [from[0] + (center[0] - from[0]) * t + drift * 3, from[1] + (center[1] - from[1]) * t];
  const z0 = scene.zoomFrom ?? 1, z1 = scene.zoomTo ?? 2;
  const zoom = z0 * Math.pow(z1 / z0, t);
  const dist = (2 + 6.5 / Math.max(0.6, zoom)) * (useVertical() ? 1.45 : 1);
  const camPos = toVec(look, dist);
  const shot: Shot = { pos: [camPos.x, camPos.y + 0.0, camPos.z], target: [0, 0, 0], fov: 40 };
  const routes = scene.routes ?? [];
  const glowMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(T.accent2) } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} ",
    fragmentShader: "uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.75 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(c, 1.0) * i; }",
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true,
  }), []);
  return (
    <AbsoluteFill>
      <Stage shot={shot} time="night" fogNear={500} fogFar={2000}>
        <Particles effect="stars" r={3} />
        <mesh>
          <sphereGeometry args={[2, 96, 64]} />
          <meshStandardMaterial map={tex} roughness={0.9} />
        </mesh>
        <mesh material={glowMat} scale={1.18}><sphereGeometry args={[2, 48, 32]} /></mesh>
        <directionalLight position={[camPos.x * 3, camPos.y * 3 + 2, camPos.z * 3]} intensity={2.2} />
        {(scene.markers ?? []).map((m, i) => {
          const at = Math.round(D * 0.3 + i * 8);
          const s = interpolate(frame, [at, at + 10], [0, 1], clamp);
          const p = toVec(m.lonlat as LonLat, 2.0);
          const n = p.clone().normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
          const pulse = 1 + 0.25 * Math.sin(frame / 5 + i);
          return (
            <group key={i} position={p} quaternion={q} scale={s}>
              <mesh position={[0, 0.12, 0]}><coneGeometry args={[0.035, 0.24, 8]} /><meshStandardMaterial color={T.accent} emissive={T.accent} emissiveIntensity={0.6} /></mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} scale={pulse}><ringGeometry args={[0.05, 0.075, 24]} /><meshBasicMaterial color={T.accent2} transparent opacity={0.8} side={THREE.DoubleSide} /></mesh>
            </group>
          );
        })}
        {routes.map((r, i) => {
          const a = toVec(r.from as LonLat, 2), b = toVec(r.to as LonLat, 2);
          const mid = a.clone().add(b).multiplyScalar(0.5);
          const lift = 2 + a.distanceTo(b) * 0.35;
          mid.normalize().multiplyScalar(lift);
          const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
          const at = Math.round(D * 0.3 + i * 15);
          const k = Math.max(0.02, interpolate(frame, [at, at + D * 0.35], [0, 1], clamp));
          const pts = curve.getPoints(60).slice(0, Math.max(2, Math.round(60 * k)));
          const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.012, 6, false);
          return <mesh key={i} geometry={tube}><meshBasicMaterial color={T.accent2} /></mesh>;
        })}
      </Stage>
      <Annotations scene={scene} />
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

/** Constellations as [x,y] on a unit chart (pole near the top), joined in order. */
const CONST: Record<string, { pts: [number, number][]; lines: [number, number][]; names: string[] }> = {
  big_dipper: { pts: [[-0.55, 0.05], [-0.38, 0.12], [-0.22, 0.12], [-0.08, 0.06], [0.04, -0.06], [0.24, -0.04], [0.3, 0.12]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]], names: ["Alkaid", "Mizar", "", "", "", "", "Dubhe"] },
  orion: { pts: [[-0.2, 0.35], [0.2, 0.32], [-0.06, 0.02], [0.0, 0.0], [0.06, -0.02], [-0.22, -0.32], [0.18, -0.35]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]], names: ["Betelgeuse", "", "", "", "", "", "Rigel"] },
  southern_cross: { pts: [[0, 0.32], [0, -0.32], [-0.22, 0.04], [0.2, 0.08]], lines: [[0, 1], [2, 3]], names: ["", "Acrux", "", ""] },
  pole: { pts: [[0, 0.0], [0.1, 0.18], [-0.15, 0.25], [0.32, -0.1], [0.36, 0.08]], lines: [[1, 0], [3, 4]], names: ["Thuban", "", "", "Kochab", ""] },
};

export const Sky3DScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const D = scene.durationInFrames;
  const rot = frame * 0.0025;
  const c = CONST[scene.constellation ?? "big_dipper"] ?? CONST.big_dipper;
  const built = buildModel(scene.model, frame, true);
  const shot: Shot = { pos: [0, 2.5, built.r * (H > W ? 6.5 : 4.2)], target: [0, built.r * 1.1, 0], fov: H > W ? 70 : 55 };
  // Overlay the constellation in screen space so its lines are crisp and readable.
  const cx = W / 2, cy = H * 0.3, s = Math.min(W, H) * 0.55;
  const draw = interpolate(frame, [D * 0.15, D * 0.6], [0, 1], clamp);
  const pts = c.pts.map(([x, y]) => {
    const a = rot * 6;
    return [cx + (x * Math.cos(a) - y * Math.sin(a)) * s, cy - (x * Math.sin(a) + y * Math.cos(a)) * s] as [number, number];
  });
  return (
    <AbsoluteFill>
      <Stage shot={shot} time="night" fogNear={200} fogFar={900}>
        <group rotation={[0, 0, rot]}>
          <Particles effect="stars" r={built.r} />
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[400, 400]} /><meshStandardMaterial color="#141820" /></mesh>
        {scene.model && built.node}
      </Stage>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {c.lines.map(([a, b], i) => {
          const k = Math.min(1, Math.max(0, draw * c.lines.length - i));
          const [x1, y1] = pts[a], [x2, y2] = pts[b];
          return <line key={i} x1={x1} y1={y1} x2={x1 + (x2 - x1) * k} y2={y1 + (y2 - y1) * k} stroke={T.accent2} strokeWidth={3} opacity={0.85} />;
        })}
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={9 + Math.sin(frame / 7 + i) * 2} fill="#fff" opacity={0.95} />
            <circle cx={x} cy={y} r={22} fill="#fff" opacity={0.12} />
            {c.names[i] && <text x={x + 22} y={y - 16} fill="#fff" fontFamily={T.font} fontWeight={600} fontSize={34} opacity={draw}>{c.names[i]}</text>}
          </g>
        ))}
      </svg>
      <Annotations scene={scene} />
      <Lower text={scene.label} />
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

export type { Vec3 };
export { LIGHT };
