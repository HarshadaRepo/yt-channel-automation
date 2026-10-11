import React, { useMemo } from "react";
import * as THREE from "three";
import { random } from "remotion";
import { fbm } from "./Stage";
import type { Model3D } from "../types";

/** Low-poly, flat-shaded material: reads as "stylised 3D" rather than fake-realistic. */
const M: React.FC<{ c: string; e?: string; ei?: number; r?: number; m?: number; o?: number; side?: THREE.Side }> = ({ c, e, ei = 0, r = 0.85, m = 0, o, side }) => (
  <meshStandardMaterial color={c} emissive={e ?? "#000000"} emissiveIntensity={ei} roughness={r} metalness={m} flatShading
    transparent={o !== undefined} opacity={o ?? 1} side={side ?? THREE.FrontSide} />
);

/** Geometry that never changes is built once per render tab, not once per frame. */
const CACHE = new Map<string, any>();
const once = <X,>(key: string, make: () => X): X => {
  if (!CACHE.has(key)) CACHE.set(key, make());
  return CACHE.get(key);
};

const SAND = "#e2c48a", STONE = "#cdb48a", STONE_D = "#a38a64", MARBLE = "#ece6da", GOLD = "#e8b931";

/** Animated water plane: gentle waves recomputed each frame. */
export const Water: React.FC<{ frame: number; size?: number; color?: string; y?: number }> = ({ frame, size = 120, color = "#2f7f9e", y = 0 }) => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, 60, 60);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size]);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, Math.sin(x * 0.35 + frame * 0.06) * 0.12 + Math.cos(z * 0.28 + frame * 0.045) * 0.12);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return (
    <mesh geometry={geo} position={[0, y, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.25} metalness={0.1} flatShading transparent opacity={0.92} />
    </mesh>
  );
};

const Ground: React.FC<{ color: string; size?: number; bumpy?: number; seed?: number }> = ({ color, size = 140, bumpy = 0.6, seed = 3 }) => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, 70, 70);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.hypot(x, z);
      // Flat near the subject, rolling dunes further out.
      p.setY(i, fbm(x * 0.05, z * 0.05, seed) * bumpy * 4 * Math.min(1, Math.max(0, (d - 9) / 14)) - 0.05);
    }
    g.computeVertexNormals();
    return g;
  }, [size, bumpy, seed]);
  return (
    <mesh geometry={geo} receiveShadow>
      <M c={color} r={1} />
    </mesh>
  );
};

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; c: string; rot?: number; e?: string; ei?: number }> = ({ p, s, c, rot = 0, e, ei }) => (
  <mesh position={p} rotation={[0, rot, 0]} castShadow receiveShadow>
    <boxGeometry args={s} />
    <M c={c} e={e} ei={ei} />
  </mesh>
);

const Cyl: React.FC<{ p: [number, number, number]; r1: number; r2?: number; h: number; c: string; seg?: number; e?: string; ei?: number }> = ({ p, r1, r2, h, c, seg = 12, e, ei }) => (
  <mesh position={p} castShadow receiveShadow>
    <cylinderGeometry args={[r2 ?? r1, r1, h, seg]} />
    <M c={c} e={e} ei={ei} />
  </mesh>
);

const Cone: React.FC<{ p: [number, number, number]; r: number; h: number; c: string; seg?: number; rotY?: number }> = ({ p, r, h, c, seg = 4, rotY = Math.PI / 4 }) => (
  <mesh position={p} rotation={[0, rotY, 0]} castShadow receiveShadow>
    <coneGeometry args={[r, h, seg]} />
    <M c={c} />
  </mesh>
);

const Palm: React.FC<{ p: [number, number, number]; s?: number; seed: number; frame: number }> = ({ p, s = 1, seed, frame }) => {
  const sway = Math.sin(frame / 25 + seed) * 0.06;
  return (
    <group position={p} scale={s} rotation={[sway, seed, sway * 0.5]}>
      <Cyl p={[0, 1.4, 0]} r1={0.14} r2={0.09} h={2.8} c="#8a6a45" seg={6} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <group key={i} position={[0, 2.8, 0]} rotation={[0, (i * Math.PI * 2) / 7, 0]}>
          <mesh position={[0.9, -0.25, 0]} rotation={[0, 0, -0.45]} scale={[1.1, 0.06, 0.32]} castShadow>
            <sphereGeometry args={[1, 8, 4]} />
            <M c={i % 2 ? "#3f8a45" : "#4c9a4f"} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** A square sail bellied out by the wind. */
const sail = (w: number, h: number) => {
  const g = new THREE.PlaneGeometry(w, h, 8, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
    p.setZ(i, (1 - x * x) * (1 - y * y * 0.4) * 0.55);
  }
  g.computeVertexNormals();
  return g;
};

type Built = { node: React.ReactNode; r: number; h: number; ground: string; water?: boolean; vent?: [number, number, number] };

/** Every model fits in a radius `r` around the origin; the camera frames it from that. */
export const buildModel = (model: Model3D | undefined, frame: number, night: boolean): Built => {
  const glow = night ? 1.6 : 0;
  switch (model) {
    case "stepPyramid": {
      const tiers = [0, 1, 2, 3, 4, 5, 6, 7];
      return {
        r: 9, h: 4, ground: "#5f7d3a",
        node: (
          <group>
            {tiers.map((i) => <Box key={i} p={[0, 0.5 + i * 1, 0]} s={[13 - i * 1.4, 1, 13 - i * 1.4]} c={i % 2 ? STONE : STONE_D} />)}
            <Box p={[0, 4.2, 6.2]} s={[2.2, 8.4, 1.6]} c={STONE_D} />
            <Box p={[0, 9.0, 0]} s={[3, 2, 3]} c="#b9a27a" />
            <Box p={[0, 10.2, 0]} s={[3.4, 0.4, 3.4]} c="#7a4a2a" />
            {[...Array(14)].map((_, i) => <Palm key={i} seed={i} frame={frame} s={1.4}
              p={[Math.cos(i * 2.4) * (13 + random(`pa${i}`) * 8), 0, Math.sin(i * 2.4) * (13 + random(`pb${i}`) * 8)]} />)}
          </group>
        ),
      };
    }
    case "obelisk":
      return {
        r: 6, h: 6, ground: SAND,
        node: (
          <group>
            <Box p={[0, 0.4, 0]} s={[3.4, 0.8, 3.4]} c={STONE_D} />
            <mesh position={[0, 6.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <cylinderGeometry args={[0.62, 1.0, 11, 4]} />
              <M c="#c9a274" />
            </mesh>
            <Cone p={[0, 12.3, 0]} r={0.62} h={1.0} c={GOLD} />
          </group>
        ),
      };
    case "temple": {
      const cols: [number, number][] = [];
      for (let i = 0; i < 8; i++) { cols.push([-7 + i * 2, 3.6]); cols.push([-7 + i * 2, -3.6]); }
      for (let i = 1; i < 4; i++) { cols.push([-7, -3.6 + i * 1.8]); cols.push([7, -3.6 + i * 1.8]); }
      const roof = once("roof", () => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-4.6, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(0, 2)]), { depth: 15.4, bevelEnabled: false }));
      return {
        r: 10, h: 3.5, ground: "#9a9a6a",
        node: (
          <group>
            {[0, 1, 2].map((i) => <Box key={i} p={[0, 0.25 + i * 0.5, 0]} s={[17.5 - i * 0.8, 0.5, 9.5 - i * 0.8]} c={MARBLE} />)}
            {cols.map(([x, z], i) => <Cyl key={i} p={[x, 3.9, z]} r1={0.42} r2={0.36} h={5.6} c={MARBLE} seg={10} />)}
            <Box p={[0, 7.1, 0]} s={[15.4, 0.8, 8.4]} c="#e2d9c8" />
            <mesh position={[7.7, 7.5, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={roof} castShadow>
              <M c="#d8cdb8" />
            </mesh>
          </group>
        ),
      };
    }
    case "colosseum": {
      const n = 32;
      return {
        r: 12, h: 3, ground: "#a8946c",
        node: (
          <group scale={[1.25, 1, 1]}>
            {[0, 1, 2, 3].map((tier) => {
              const arc = tier === 3 ? Math.PI * 1.1 : Math.PI * 2;
              return (
                <group key={tier}>
                  <mesh position={[0, 1.25 + tier * 2.5, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[9 - tier * 0.15, 9 - tier * 0.15, 2.5, 64, 1, true, 0, arc]} />
                    <M c={tier % 2 ? "#cdb38a" : "#c3a679"} side={THREE.DoubleSide} />
                  </mesh>
                  {tier < 3 && [...Array(n)].map((_, i) => {
                    const a = (i / n) * Math.PI * 2;
                    return (
                      <mesh key={i} position={[Math.sin(a) * 9.05, 1.1 + tier * 2.5, Math.cos(a) * 9.05]} rotation={[0, a, 0]}>
                        <planeGeometry args={[0.9, 1.6]} />
                        <meshStandardMaterial color="#3a2c1e" side={THREE.DoubleSide} />
                      </mesh>
                    );
                  })}
                  <mesh position={[0, 2.5 + tier * 2.5, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
                    <torusGeometry args={[9 - tier * 0.15, 0.18, 4, 64, arc]} />
                    <M c={STONE_D} />
                  </mesh>
                </group>
              );
            })}
            {/* Inner seating rings. */}
            {[0, 1, 2, 3].map((k) => (
              <mesh key={`s${k}`} position={[0, 0.6 + k * 1.4, 0]}>
                <cylinderGeometry args={[6.2 + k * 0.7, 6.2 + k * 0.7, 1.2, 48, 1, true]} />
                <M c="#b89a6c" side={THREE.DoubleSide} />
              </mesh>
            ))}
            <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[6.2, 40]} />
              <M c="#d9b77a" />
            </mesh>
          </group>
        ),
      };
    }
    case "castle": {
      const towers: [number, number][] = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
      return {
        r: 10, h: 4, ground: "#5a7a3a",
        node: (
          <group>
            {towers.map(([x, z], i) => (
              <group key={i}>
                <Cyl p={[x, 4, z]} r1={1.6} h={8} c="#8f8b84" seg={10} />
                <Cone p={[x, 9.6, z]} r={2.0} h={3.2} c="#7a2f2a" seg={10} rotY={0} />
                <Box p={[x, 6.5, z + 1.55]} s={[0.4, 0.8, 0.1]} c="#2a2a30" e="#ffb347" ei={glow} />
              </group>
            ))}
            {[[0, -6, 12, 0], [0, 6, 12, 0], [-6, 0, 12, Math.PI / 2], [6, 0, 12, Math.PI / 2]].map(([x, z, l, r], i) => (
              <group key={i}>
                <Box p={[x, 2.6, z]} s={[l, 5.2, 1.2]} rot={r} c="#9a958c" />
                {[...Array(10)].map((_, k) => {
                  const off = -5 + k * 1.1;
                  return <Box key={k} p={[x + (r ? 0 : off), 5.5, z + (r ? off : 0)]} s={[0.5, 0.6, 1.3]} rot={r} c="#9a958c" />;
                })}
              </group>
            ))}
            <Box p={[0, 4.5, 0]} s={[5, 9, 5]} c="#a29d93" />
            <Cone p={[0, 10.5, 0]} r={3.6} h={3} c="#7a2f2a" />
            <Box p={[0, 1.4, 6.65]} s={[2.2, 2.8, 0.2]} c="#4a3322" />
          </group>
        ),
      };
    }
    case "wall": {
      const segs = 60;
      const pts = [...Array(segs)].map((_, i) => {
        const x = -40 + (i / segs) * 80;
        const z = Math.sin(i / 6) * 6;
        const y = fbm(x * 0.05, z * 0.05, 9) * 7;
        return [x, y, z] as [number, number, number];
      });
      return {
        r: 14, h: 4, ground: "#5d7a45",
        node: (
          <group>
            {pts.slice(0, -1).map((p, i) => {
              const q = pts[i + 1];
              const len = Math.hypot(q[0] - p[0], q[2] - p[2]) + 0.3;
              const rot = -Math.atan2(q[2] - p[2], q[0] - p[0]);
              return (
                <group key={i}>
                  <Box p={[(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 1, (p[2] + q[2]) / 2]} s={[len, 2, 1.4]} rot={rot} c="#a39274" />
                  {i % 8 === 0 && <Box p={[p[0], p[1] + 2.2, p[2]]} s={[2.4, 4.4, 2.4]} c="#968567" />}
                </group>
              );
            })}
            {/* Hills the wall rides along. */}
            {pts.filter((_, i) => i % 3 === 0).map((p, i) => (
              <mesh key={`h${i}`} position={[p[0], p[1] * 0.5 - 2.2, p[2]]} scale={[6, Math.max(1, p[1] + 2.2), 7]}>
                <sphereGeometry args={[1, 7, 5]} />
                <M c="#4f6e3a" />
              </mesh>
            ))}
          </group>
        ),
      };
    }
    case "ship": {
      const roll = Math.sin(frame / 22) * 0.05;
      const pitch = Math.sin(frame / 31) * 0.03;
      const hull = once("hull", () => {
        const h = new THREE.Shape();
        h.moveTo(-6, 1.6); h.lineTo(6.5, 1.8); h.quadraticCurveTo(5.5, -0.4, 3.5, -1); h.lineTo(-5, -1); h.quadraticCurveTo(-6.2, 0, -6, 1.6);
        return new THREE.ExtrudeGeometry(h, { depth: 2.8, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 2 });
      });
      const billow = 1 + Math.sin(frame / 18) * 0.04;
      return {
        r: 9, h: 4, ground: "#000", water: true,
        node: (
          <group rotation={[pitch, 0.4, roll]} position={[0, 0.6, 0]}>
            <mesh position={[0, 0, -1.4]} geometry={hull} castShadow>
              <M c="#6b4426" />
            </mesh>
            <Box p={[-4.4, 2.6, 0]} s={[2.6, 1.4, 3.0]} c="#7d5230" />
            {[-2.5, 1, 4].map((x, i) => (
              <group key={i}>
                <Cyl p={[x, 6.5, 0]} r1={0.16} h={10 - i * 1.5} c="#4a2f1a" seg={6} />
                {[0, 1].map((k) => (
                  <group key={k}>
                    <mesh position={[x + 0.35, 4.6 + k * 3.1 - i * 0.3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[1, 1, billow]} geometry={once(`sail${k}`, () => sail(3.6 - k * 0.8, 2.7))} castShadow>
                      <M c="#efe6d0" side={THREE.DoubleSide} />
                    </mesh>
                    <Box p={[x, 6 + k * 3.1 - i * 0.3, 0]} s={[0.12, 0.12, 4 - k * 0.8]} c="#4a2f1a" />
                  </group>
                ))}
              </group>
            ))}
            <Box p={[-2.5, 11.8, 0]} s={[0.05, 0.9, 1.4]} c="#b3261e" />
          </group>
        ),
      };
    }
    case "volcano": {
      const prof = [[0.1, 7.2], [1.8, 7.6], [2.6, 7.3], [5, 4.5], [9, 1.6], [14, 0]].map(([x, y]) => new THREE.Vector2(x, y));
      return {
        r: 12, h: 4, ground: "#2e2a28", vent: [0, 7.4, 0],
        node: (
          <group>
            <mesh castShadow receiveShadow>
              <latheGeometry args={[prof, 18]} />
              <M c="#4a3f3a" />
            </mesh>
            <mesh position={[0, 7.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.8, 18]} />
              <meshBasicMaterial color="#ff5a1f" />
            </mesh>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[Math.cos(i * 2.1) * 3, 4.9 - i * 0.6, Math.sin(i * 2.1) * 3]} rotation={[0.5, i * 2.1, 0.3]}>
                <boxGeometry args={[0.35, 0.05, 4.5]} />
                <meshBasicMaterial color="#ff7a26" />
              </mesh>
            ))}
            <pointLight position={[0, 8.5, 0]} color="#ff6a2a" intensity={60 + Math.sin(frame / 4) * 15} distance={30} />
          </group>
        ),
      };
    }
    case "island": {
      const geo = once("island", () => {
        const g = new THREE.SphereGeometry(8, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
          p.setY(i, y * 0.45 + fbm(x * 0.2, z * 0.2, 4) * 2.2 - 0.8);
        }
        g.computeVertexNormals();
        return g;
      });
      return {
        r: 10, h: 2, ground: "#000", water: true,
        node: (
          <group>
            <mesh geometry={geo} castShadow receiveShadow><M c="#d9c27e" /></mesh>
            <mesh position={[1, 2.2, -1]} scale={[4.5, 2.6, 4]} castShadow><sphereGeometry args={[1, 9, 7]} /><M c="#3e7d3c" /></mesh>
            {[...Array(9)].map((_, i) => <Palm key={i} seed={i} frame={frame} s={0.9}
              p={[Math.cos(i * 0.7) * (4.5 + random(`ia${i}`) * 1.5), 1.1, Math.sin(i * 0.7) * (4.5 + random(`ib${i}`) * 1.5)]} />)}
          </group>
        ),
      };
    }
    case "city":
    case "skyscraper": {
      const n = 13;
      const tall = model === "skyscraper";
      const blocks: React.ReactNode[] = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = (i - n / 2) * 2.6, z = (j - n / 2) * 2.6;
        const d = Math.hypot(x, z);
        if (tall && d < 4) continue;
        const h = 1 + random(`b${i}-${j}`) * (10 - d * 0.35) * (tall ? 0.6 : 1);
        if (h < 0.6) continue;
        const c = ["#7b8794", "#9aa5b1", "#5f6b78", "#b6bec7"][Math.floor(random(`c${i}-${j}`) * 4)];
        blocks.push(<Box key={`${i}-${j}`} p={[x, h / 2, z]} s={[1.8, h, 1.8]} c={night ? "#2c3440" : c} e="#ffcf6a" ei={night ? 0.04 + random(`w${i}-${j}`) * 0.22 : 0} />);
      }
      return {
        r: 14, h: tall ? 8 : 3, ground: "#3a3f45",
        node: (
          <group>
            {blocks}
            {tall && (
              <group>
                {[0, 1, 2, 3, 4].map((k) => <Box key={k} p={[0, 3 + k * 5.4, 0]} s={[4.2 - k * 0.6, 6, 4.2 - k * 0.6]} c="#a9c2d6" e="#9fd2ff" ei={night ? 0.5 : 0.05} />)}
                <Cyl p={[0, 31, 0]} r1={0.15} r2={0.04} h={6} c="#d0d6dc" seg={6} />
              </group>
            )}
          </group>
        ),
      };
    }
    case "stonehenge": {
      const n = 16;
      return {
        r: 8, h: 2, ground: "#5f8a45",
        node: (
          <group>
            {[...Array(n)].map((_, i) => {
              if (i === 5 || i === 11) return null;
              const a = (i / n) * Math.PI * 2;
              return (
                <group key={i}>
                  <Box p={[Math.cos(a) * 6, 2, Math.sin(a) * 6]} s={[1.1, 4, 0.7]} rot={-a + Math.PI / 2} c="#8f8c86" />
                  {i % 2 === 0 && <Box p={[Math.cos(a + 0.2) * 6, 4.25, Math.sin(a + 0.2) * 6]} s={[2.6, 0.5, 0.7]} rot={-a - 0.2 + Math.PI / 2} c="#86837d" />}
                </group>
              );
            })}
            {[0, 1, 2, 3, 4].map((i) => {
              const a = -0.9 + i * 0.45;
              return <Box key={`t${i}`} p={[Math.cos(a) * 3, 2.8, Math.sin(a) * 3]} s={[1.2, 5.6, 0.8]} rot={-a + Math.PI / 2} c="#7d7a74" />;
            })}
          </group>
        ),
      };
    }
    case "lighthouse": {
      const beam = frame * 0.05;
      return {
        r: 8, h: 6, ground: "#000", water: true,
        node: (
          <group>
            <mesh position={[0, 0.4, 0]} scale={[6, 1.6, 5]}><sphereGeometry args={[1, 9, 6]} /><M c="#5a5a55" /></mesh>
            {[0, 1, 2, 3].map((k) => <Cyl key={k} p={[0, 2.2 + k * 2.2, 0]} r1={1.4 - k * 0.15} r2={1.25 - k * 0.15} h={2.2} c={k % 2 ? "#c0392b" : "#f2f2f2"} seg={14} />)}
            <Cyl p={[0, 11.5, 0]} r1={0.9} h={1.4} c="#fff7c2" e="#fff2a8" ei={night ? 2 : 0.6} seg={10} />
            <Cone p={[0, 12.8, 0]} r={1.1} h={1.2} c="#2b2b2b" seg={10} rotY={0} />
            <mesh position={[Math.cos(beam) * 9, 11.5, Math.sin(beam) * 9]} rotation={[0, -beam, Math.PI / 2]}>
              <coneGeometry args={[2.4, 18, 16, 1, true]} />
              <meshBasicMaterial color="#fff2b0" transparent opacity={night ? 0.12 : 0.05} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ),
      };
    }
    case "statue": {
      const head = (x: number, z: number, s: number, k: number) => (
        <group key={k} position={[x, 0, z]} scale={s} rotation={[0, -0.3 + k * 0.12, 0]}>
          <Box p={[0, 1.2, 0]} s={[2.2, 2.4, 1.6]} c="#6d655c" />
          <Box p={[0, 3.6, 0]} s={[1.8, 3.2, 1.6]} c="#776e64" />
          <Box p={[0, 3.3, 0.95]} s={[0.5, 1.6, 0.5]} c="#6a6158" />
          <Box p={[0, 4.6, 0.85]} s={[1.9, 0.5, 0.5]} c="#5f574e" />
          <Box p={[0, 5.4, 0]} s={[1.5, 0.7, 1.4]} c="#8a4b32" />
        </group>
      );
      return {
        r: 9, h: 3, ground: "#4f7a3a",
        node: <group>{[-6, -3, 0, 3, 6].map((x, k) => head(x, 0, 1 + (k === 2 ? 0.2 : 0), k))}<Box p={[0, 0.2, 0]} s={[16, 0.4, 3]} c="#55524c" /></group>,
      };
    }
    case "bridge": {
      // Roman stone arch bridge / aqueduct: one wall with round arches cut out of it.
      const wall = once("bridge", () => {
        const sh = new THREE.Shape();
        sh.moveTo(-22, -1); sh.lineTo(22, -1); sh.lineTo(22, 11); sh.lineTo(-22, 11); sh.lineTo(-22, -1);
        for (const x of [-15, -7.5, 0, 7.5, 15]) {
          const hole = new THREE.Path();
          hole.moveTo(x - 3, -1); hole.lineTo(x + 3, -1); hole.lineTo(x + 3, 5.5);
          hole.absarc(x, 5.5, 3, 0, Math.PI, false);
          hole.lineTo(x - 3, -1);
          sh.holes.push(hole);
        }
        const g = new THREE.ExtrudeGeometry(sh, { depth: 3.2, bevelEnabled: false });
        g.translate(0, 0, -1.6);
        return g;
      });
      return {
        r: 14, h: 4, ground: "#000", water: true,
        node: (
          <group>
            <mesh geometry={wall} castShadow receiveShadow><M c="#c3ab84" /></mesh>
            <Box p={[0, 11.25, 0]} s={[44, 0.5, 3.8]} c="#a89270" />
            {[...Array(22)].map((_, k) => <Box key={`p${k}`} p={[-21 + k * 2, 11.9, 1.7]} s={[0.4, 0.8, 0.3]} c="#a89270" />)}
            <Box p={[0, 13.0, 0]} s={[1.6, 3, 1.6]} c="#b59e78" />
            <Cone p={[0, 14.9, 0]} r={1.3} h={0.8} c="#b59e78" />
          </group>
        ),
      };
    }
    case "pyramid":
    default: {
      return {
        r: 10, h: 4, ground: SAND,
        node: (
          <group>
            <Cone p={[0, 5.2, 0]} r={10} h={10.4} c="#d8b880" />
            <Cone p={[0, 10.0, 0]} r={0.95} h={0.9} c={GOLD} />
            <group position={[17, 0, -10]}><Cone p={[0, 3.4, 0]} r={6.4} h={6.8} c="#cdaa72" /></group>
            <group position={[-15, 0, -18]}><Cone p={[0, 2.4, 0]} r={4.6} h={4.8} c="#c9a56c" /></group>
            {[...Array(10)].map((_, i) => <Palm key={i} seed={i} frame={frame} s={1.2}
              p={[-26 + i * 2.6, 0, 16 + random(`pp${i}`) * 4]} />)}
          </group>
        ),
      };
    }
  }
};

export const ModelGround: React.FC<{ built: Built; frame: number; color?: string }> = ({ built, frame, color }) =>
  built.water ? <Water frame={frame} color={color} /> : <Ground color={built.ground} />;
