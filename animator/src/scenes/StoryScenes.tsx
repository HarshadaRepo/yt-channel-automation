import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";
import { Chip, Icon, clamp, ease, usePop, useVertical } from "../common";
import { LIGHT, type TimeOfDay } from "../three/Stage";
import type { Scene } from "../types";

// ---------- colour helpers ----------
const hex = (c: string): number[] => {
  if (c.startsWith("rgb")) return c.replace(/[^\d,]/g, "").split(",").slice(0, 3).map(Number);
  if (c.length === 4) return [1, 2, 3].map((i) => parseInt(c[i] + c[i], 16));
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
};
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
};

// ---------- silhouettes ----------
/** A ridge line across the whole width, as a closed path down to the bottom. */
const ridge = (W: number, H: number, base: number, amp: number, seed: string, step: number, sharp: boolean) => {
  let d = `M -200 ${H} L -200 ${base}`;
  for (let x = -200; x <= W + 400; x += step) {
    const y = base - (sharp ? random(`${seed}${x}`) : 0.5 + 0.5 * Math.sin(x / (step * 2.3) + random(seed) * 6)) * amp;
    d += ` L ${x} ${y}`;
  }
  return d + ` L ${W + 400} ${H} Z`;
};

const Person: React.FC<{ x: number; y: number; s: number; frame: number; kind: string; color: string; seed: number; walk?: boolean }> = ({ x, y, s, frame, kind, color, seed, walk = true }) => {
  const ph = walk ? Math.sin(frame / 5 + seed) * 0.5 : 0;
  const bob = walk ? Math.abs(Math.sin(frame / 5 + seed)) * 2 * s : 0;
  const leg = (a: number) => `M 0 -38 L ${Math.sin(a) * 14} 0`;
  return (
    <g transform={`translate(${x},${y - bob}) scale(${s})`} fill={color} stroke={color} strokeLinecap="round">
      <path d={leg(ph)} strokeWidth={7} fill="none" />
      <path d={leg(-ph)} strokeWidth={7} fill="none" />
      <path d="M -10 -40 Q -12 -70 -6 -78 L 6 -78 Q 12 -70 10 -40 Z" />
      <circle cx={0} cy={-88} r={10} />
      {kind === "soldiers" && <><line x1={16} y1={-110} x2={16} y2={0} strokeWidth={3} /><path d="M 13 -118 L 16 -108 L 19 -118 Z" /><ellipse cx={-12} cy={-58} rx={9} ry={16} /><path d="M -11 -96 Q 0 -110 11 -96 Z" /></>}
      {kind === "royalty" && <><path d="M -9 -98 L -9 -108 L -4 -102 L 0 -110 L 4 -102 L 9 -108 L 9 -98 Z" fill={T.accent2} stroke="none" /><path d="M -10 -76 Q -26 -30 -20 0 L 20 0 Q 26 -30 10 -76 Z" opacity={0.9} /></>}
      {kind === "workers" && <rect x={-18} y={-128} width={36} height={24} rx={2} transform={`rotate(${Math.sin(frame / 10 + seed) * 3})`} />}
      {kind === "explorers" && <><rect x={-20} y={-74} width={12} height={26} rx={4} /><line x1={18} y1={-100} x2={22} y2={0} strokeWidth={3} /><path d="M -14 -96 L 14 -96 L 8 -102 L -8 -102 Z" /></>}
      {kind === "sailors" && <path d="M -10 -97 L 10 -97 L 6 -104 L -6 -104 Z" />}
      {kind === "traveler" && <line x1={16} y1={-96} x2={20} y2={0} strokeWidth={3} />}
    </g>
  );
};

const Ship: React.FC<{ x: number; y: number; s: number; frame: number; color: string }> = ({ x, y, s, frame, color }) => {
  const roll = Math.sin(frame / 20) * 3;
  const bob = Math.sin(frame / 15) * 4;
  return (
    <g transform={`translate(${x},${y + bob}) rotate(${roll}) scale(${s})`} fill={color}>
      <path d="M -140 0 L 150 0 L 110 40 L -110 40 Z" />
      <rect x={-6} y={-200} width={6} height={200} />
      <rect x={-86} y={-150} width={5} height={150} />
      <rect x={70} y={-140} width={5} height={140} />
      <path d={`M 0 -190 Q ${70 + Math.sin(frame / 12) * 8} -140 0 -80 Z`} opacity={0.85} />
      <path d={`M 0 -75 Q ${80 + Math.sin(frame / 12) * 8} -40 0 -10 Z`} opacity={0.85} />
      <path d={`M -83 -140 Q ${-30 + Math.sin(frame / 12) * 6} -100 -83 -60 Z`} opacity={0.85} />
      <path d={`M 72 -132 Q ${120 + Math.sin(frame / 12) * 6} -95 72 -55 Z`} opacity={0.85} />
      <path d={`M -3 -200 l 30 ${6 + Math.sin(frame / 6) * 4} l -30 8 Z`} fill={T.accent} />
    </g>
  );
};

const Prop: React.FC<{ kind: string; x: number; y: number; s: number; frame: number; color: string; seed: number }> = ({ kind, x, y, s, frame, color, seed }) => {
  const g = (children: React.ReactNode) => <g transform={`translate(${x},${y}) scale(${s})`} fill={color}>{children}</g>;
  switch (kind) {
    case "ship":
      return <Ship x={x} y={y} s={s * 0.8} frame={frame} color={color} />;
    case "campfire": {
      const f = (k: number) => 1 + Math.sin(frame / 2.3 + k) * 0.15;
      return g(<>
        <circle cx={0} cy={-30} r={120} fill={T.accent2} opacity={0.12 + Math.sin(frame / 3) * 0.03} />
        <path d={`M -30 0 Q -10 ${-70 * f(1)} 0 ${-90 * f(2)} Q 10 ${-60 * f(3)} 30 0 Z`} fill={T.accent} />
        <path d={`M -15 0 Q 0 ${-50 * f(4)} 15 0 Z`} fill={T.accent2} />
        <rect x={-40} y={-6} width={80} height={10} rx={4} transform="rotate(8)" />
      </>);
    }
    case "tents":
      return g(<><path d="M -90 0 L -30 -90 L 30 0 Z" /><path d="M 20 0 L 70 -70 L 120 0 Z" opacity={0.9} /><path d="M -40 0 L -30 -40 L -20 0 Z" fill={T.accent2} opacity={0.6} /></>);
    case "cart": {
      const r = frame * 4;
      return g(<><rect x={-70} y={-80} width={140} height={50} rx={6} /><line x1={70} y1={-55} x2={140} y2={-40} stroke={color} strokeWidth={6} />
        {[-40, 40].map((cx) => <g key={cx} transform={`translate(${cx},-22) rotate(${r})`}><circle r={24} fill="none" stroke={color} strokeWidth={7} /><line x1={-24} y1={0} x2={24} y2={0} stroke={color} strokeWidth={4} /><line x1={0} y1={-24} x2={0} y2={24} stroke={color} strokeWidth={4} /></g>)}</>);
    }
    case "camel": {
      const l = Math.sin(frame / 6 + seed) * 10;
      return g(<><path d="M -70 -90 Q -60 -140 -30 -110 Q -10 -150 20 -110 Q 50 -100 60 -110 L 95 -160 L 110 -150 L 80 -90 Q 60 -70 -60 -75 Z" />
        {[-55, -30, 30, 55].map((lx, i) => <line key={i} x1={lx} y1={-80} x2={lx + (i % 2 ? l : -l)} y2={0} stroke={color} strokeWidth={9} strokeLinecap="round" />)}</>);
    }
    case "horse": {
      const l = Math.sin(frame / 4 + seed) * 14;
      return g(<><path d="M -70 -100 Q 0 -120 60 -100 L 95 -150 L 115 -140 L 85 -85 Q 40 -70 -70 -75 Q -95 -85 -100 -60 L -95 -90 Z" />
        {[-55, -35, 40, 60].map((lx, i) => <line key={i} x1={lx} y1={-80} x2={lx + (i % 2 ? l : -l)} y2={0} stroke={color} strokeWidth={8} strokeLinecap="round" />)}</>);
    }
    case "tower":
      return g(<><rect x={-40} y={-320} width={80} height={320} /><path d="M -55 -320 L 0 -400 L 55 -320 Z" />{[0, 1, 2].map((i) => <rect key={i} x={-8} y={-280 + i * 80} width={16} height={26} fill={T.accent2} opacity={0.7} />)}</>);
    case "pyramid":
      return g(<path d="M -260 0 L 0 -250 L 260 0 Z" />);
    case "palms":
      return g(<>{[0, 1, 2].map((i) => {
        const sw = Math.sin(frame / 25 + i) * 4;
        return <g key={i} transform={`translate(${i * 70 - 70},0) rotate(${sw})`}><path d={`M -5 0 Q ${10} -100 0 -200 L 8 -200 Q 18 -100 5 0 Z`} />
          {[0, 1, 2, 3, 4].map((k) => <path key={k} d="M 4 -200 Q 60 -230 100 -180 Q 60 -210 4 -194 Z" transform={`rotate(${-90 + k * 45}, 4, -200)`} />)}</g>;
      })}</>);
    case "ruins":
      return g(<>{[-120, -40, 40, 120].map((cx, i) => <rect key={i} x={cx - 18} y={-(80 + random(`ru${seed}${i}`) * 180)} width={36} height={80 + random(`ru${seed}${i}`) * 180} />)}<rect x={-140} y={-10} width={280} height={10} /><rect x={-60} y={-250} width={140} height={22} transform="rotate(-6)" /></>);
    case "flag": {
      const w = (k: number) => Math.sin(frame / 6 + k) * 10;
      return g(<><rect x={-3} y={-260} width={6} height={260} /><path d={`M 3 -258 Q 50 ${-268 + w(0)} 100 ${-258 + w(1)} L 100 ${-188 + w(2)} Q 50 ${-198 + w(3)} 3 -188 Z`} fill={T.accent} /></>);
    }
    case "torch": {
      const f = 1 + Math.sin(frame / 2) * 0.2;
      return g(<><circle cx={0} cy={-170} r={70} fill={T.accent2} opacity={0.18} /><rect x={-5} y={-150} width={10} height={150} /><path d={`M -14 -150 Q 0 ${-200 * f} 14 -150 Z`} fill={T.accent} /></>);
    }
    default:
      return null;
  }
};

const SETTING_PROPS: Record<string, string[]> = {
  desert: ["camel", "palms"], sea: ["ship"], forest: ["tents"], city: ["tower"], mountains: ["flag"],
  village: ["cart", "campfire"], battlefield: ["flag", "torch"], ice: ["flag"], coast: ["ship", "tower"],
};

/** 2.5D illustrated scene: parallax silhouettes, figures that walk, weather, and a slow camera pan. */
export const StoryScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const v = H > W;
  const time = (scene.time as TimeOfDay) ?? "sunset";
  const L = LIGHT[time] ?? LIGHT.sunset;
  const setting = scene.setting ?? "desert";
  const sea = setting === "sea" || setting === "coast";
  const horizon = H * (v ? 0.55 : 0.62);
  const pan = frame * 1.2;
  const far = mix(L.sky[1], "#000000", 0.25), mid = mix(L.sky[1], "#000000", 0.55), near = mix(L.sky[1], "#000000", 0.82);
  const ground = setting === "ice" ? mix("#e8f2fa", L.sky[0], 0.3) : setting === "desert" ? mix("#c9995a", "#000", time === "night" ? 0.7 : 0.35) : near;
  const props = scene.props?.length ? scene.props : SETTING_PROPS[setting] ?? [];
  const figs = scene.figures ?? "traveler";
  const count = figs === "crowd" || figs === "soldiers" || figs === "workers" ? 7 : figs === "none" ? 0 : figs === "royalty" ? 3 : 2;
  const sunY = time === "night" ? H * 0.18 : time === "day" ? H * 0.15 : horizon - H * 0.12;
  const sharp = setting === "mountains" || setting === "ice" || setting === "battlefield";
  const weather = scene.effect ?? (time === "storm" ? "rain" : setting === "ice" ? "snow" : setting === "desert" ? "dust" : undefined);
  return (
    <AbsoluteFill>
      <svg width={W} height={H}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={L.sky[0]} /><stop offset="1" stopColor={L.sky[1]} /></linearGradient>
          <radialGradient id="sun"><stop offset="0" stopColor="#fff8e0" /><stop offset="0.25" stopColor={time === "night" ? "#e8eeff" : "#ffd98a"} /><stop offset="1" stopColor={L.sky[1]} stopOpacity={0} /></radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#sky)" />
        {(time === "night" || time === "dawn") && [...Array(140)].map((_, i) => (
          <circle key={i} cx={random(`sx${i}`) * W} cy={random(`sy${i}`) * horizon * 0.9} r={0.8 + random(`sr${i}`) * 1.8} fill="#fff"
            opacity={(0.3 + 0.7 * Math.abs(Math.sin(frame / 20 + i))) * (time === "dawn" ? 0.4 : 1)} />
        ))}
        <circle cx={W * 0.72 - pan * 0.05} cy={sunY} r={H * 0.22} fill="url(#sun)" opacity={time === "storm" ? 0.2 : 0.9} />
        <circle cx={W * 0.72 - pan * 0.05} cy={sunY} r={H * 0.05} fill={time === "night" ? "#eef2ff" : "#fff3cf"} opacity={time === "storm" ? 0.2 : 1} />
        {time === "storm" && frame % 70 < 3 && <rect width={W} height={H} fill="#fff" opacity={0.5} />}
        {/* Far, mid and near layers move at different speeds: that's the parallax. */}
        <g transform={`translate(${-pan * 0.15},0)`}>
          {setting === "city" ? [...Array(40)].map((_, i) => {
            const h = 80 + random(`ct${i}`) * 260;
            return <rect key={i} x={i * 70 - 100} y={horizon - h} width={60} height={h + 10} fill={far} />;
          }) : !sea && <path d={ridge(W, H, horizon - 40, sharp ? 260 : 110, `${setting}f`, sharp ? 90 : 160, sharp)} fill={far} />}
        </g>
        {sea && <rect x={0} y={horizon} width={W} height={H - horizon} fill={mix(L.sky[1], "#0a2a3a", 0.6)} />}
        {sea && [...Array(14)].map((_, i) => (
          <path key={i} d={`M ${-200 + ((i * 260 - pan * 0.6) % (W + 400) + W + 400) % (W + 400)} ${horizon + 20 + (i % 5) * 50} q 40 -14 80 0 q 40 14 80 0`}
            stroke="#ffffff" strokeOpacity={0.25} fill="none" strokeWidth={3} />
        ))}
        <g transform={`translate(${-pan * 0.4},0)`}>
          {!sea && <path d={ridge(W, H, horizon + 30, sharp ? 120 : 60, `${setting}m`, 120, false)} fill={mid} />}
          {props.map((p, i) => (
            <Prop key={i} kind={p} seed={i} frame={frame} color={p === "ship" ? mix(mid, "#000", 0.2) : mid}
              x={W * (0.25 + i * 0.32) + (v ? 0 : 0)} y={p === "ship" ? horizon + 40 : horizon + 40 + i * 6} s={v ? 0.9 : 1} />
          ))}
        </g>
        {!sea && <rect x={0} y={horizon + 90} width={W} height={H} fill={ground} />}
        <g transform={`translate(${(frame * 2.2) % 1},0)`}>
          {[...Array(count)].map((_, i) => {
            const speed = figs === "royalty" ? 0.6 : 1.6;
            const x = ((W * 0.1 + i * (W / (count + 1)) * 0.75 + frame * speed) % (W + 200)) - 100;
            return <Person key={i} x={x} y={horizon + (sea ? 200 : 150) + (i % 3) * 18} s={(v ? 1.6 : 1.4) * (0.9 + (i % 3) * 0.1)} frame={frame}
              kind={figs} color={near} seed={i} walk={figs !== "royalty" || i > 0} />;
          })}
        </g>
        {weather && [...Array(weather === "rain" ? 160 : 90)].map((_, i) => {
          const sp = 0.5 + random(`w${i}`);
          const x = (random(`wx${i}`) * W + (weather === "dust" ? frame * 4 * sp : 0)) % W;
          const y = (random(`wy${i}`) * H + frame * (weather === "rain" ? 28 : weather === "snow" ? 2.5 : 0.6) * sp) % H;
          return weather === "rain"
            ? <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 26} stroke="#cfe0ef" strokeOpacity={0.5} strokeWidth={2} />
            : <circle key={i} cx={x} cy={y} r={weather === "snow" ? 3 + sp * 2 : 2} fill={weather === "snow" ? "#fff" : "#f0d9a8"} opacity={0.7} />;
        })}
      </svg>
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

/** An old letter, decree or diary page with the quote "hand-written" in. */
export const DocumentScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const v = useVertical();
  const D = scene.durationInFrames;
  const quote = scene.quote ?? scene.narration;
  const shown = Math.floor(interpolate(frame, [12, D * 0.75], [0, quote.length], clamp));
  const pop = usePop(0, 14);
  const seal = usePop(Math.round(D * 0.78), 8);
  const tilt = -4 + Math.sin(frame / 60) * 1.2;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, ${T.oceanLight}, ${T.ocean})`, justifyContent: "center", alignItems: "center", perspective: 1600 }}>
      <div style={{ width: v ? 900 : 1300, minHeight: v ? 1100 : 760, background: `linear-gradient(135deg, ${T.paper}, ${mix(T.paper.length === 7 ? T.paper : "#f3e3c1", "#8a6a3a", 0.18)})`,
        borderRadius: 8, padding: v ? "80px 70px" : "70px 90px", boxShadow: "0 40px 80px rgba(0,0,0,0.6), inset 0 0 120px rgba(120,80,30,0.35)",
        transform: `rotateX(${(1 - pop) * 50}deg) rotateZ(${tilt}deg) scale(${0.85 + pop * 0.15})`, opacity: pop, position: "relative", marginBottom: v ? 300 : 40 }}>
        {scene.heading && <div style={{ fontFamily: T.display, fontSize: v ? 64 : 60, color: "#5a3a1a", marginBottom: 30, letterSpacing: 2 }}>{scene.heading}</div>}
        <div style={{ fontFamily: T.hand, fontSize: v ? 70 : 66, lineHeight: 1.25, color: "#2b1a0e" }}>
          {quote.slice(0, shown)}
          <span style={{ opacity: frame % 20 < 10 && shown < quote.length ? 1 : 0 }}>|</span>
        </div>
        {scene.author && <div style={{ fontFamily: T.hand, fontSize: v ? 56 : 52, color: "#5a3a1a", marginTop: 40, textAlign: "right", opacity: interpolate(frame, [D * 0.7, D * 0.8], [0, 1], clamp) }}>— {scene.author}</div>}
        <div style={{ position: "absolute", right: -40, bottom: -40, width: 170, height: 170, borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, ${mix("#c0392b", "#ffffff", 0.2)}, #7a1a12)`, transform: `scale(${seal * (2 - seal)}) rotate(-12deg)`,
          boxShadow: "0 8px 20px rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 80 }}>
          <span style={{ fontFamily: T.emoji }}>{scene.icon ?? "📜"}</span>
        </div>
      </div>
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

/** Two sides slam in from the edges with a VS badge between them. */
export const VersusScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const v = useVertical();
  const D = scene.durationInFrames;
  const l = ease(interpolate(frame, [0, 14], [0, 1], clamp));
  const r = ease(interpolate(frame, [6, 20], [0, 1], clamp));
  const vs = usePop(18, 7);
  const shake = frame > 18 && frame < 26 ? Math.sin(frame * 3) * 8 : 0;
  const side = (s: Scene["left"], color: string, k: number, dir: number) => {
    const pts = s?.points ?? [];
    return (
      <div style={{ flex: 1, background: `linear-gradient(${dir > 0 ? 135 : 225}deg, ${color}, ${mix(color.length === 7 ? color : "#333333", "#000000", 0.6)})`,
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 50, gap: 22,
        paddingTop: v && dir > 0 ? 200 : 50,
        transform: v ? `translateY(${(1 - k) * dir * -1200}px)` : `translateX(${(1 - k) * dir * -1100}px)` }}>
        {s?.icon && <Icon icon={s.icon} size={v ? 150 : 170} delay={10} />}
        <div style={{ fontFamily: T.display, fontSize: v ? 96 : 104, color: T.white, textAlign: "center", lineHeight: 1 }}>{s?.label}</div>
        {pts.map((p, i) => {
          const at = 26 + i * Math.max(8, (D * 0.5) / Math.max(1, pts.length));
          const o = interpolate(frame, [at, at + 10], [0, 1], clamp);
          return <div key={i} style={{ fontFamily: T.font, fontWeight: 600, fontSize: v ? 42 : 40, color: T.white, opacity: o, transform: `translateY(${(1 - o) * 20}px)`, textAlign: "center", maxWidth: 760 }}>{p}</div>;
        })}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.4}px)` }}>
      <div style={{ display: "flex", flexDirection: v ? "column" : "row", width: "100%", height: v ? "75%" : "100%" }}>
        {side(scene.left, T.oceanLight, l, 1)}
        {side(scene.right, mix(T.accent, "#000000", 0.35), r, -1)}
      </div>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: v ? 480 : 0 }}>
        <div style={{ width: 200, height: 200, borderRadius: "50%", background: T.accent2, color: T.ink, fontFamily: T.display, fontSize: 110,
          display: "flex", justifyContent: "center", alignItems: "center", transform: `scale(${vs}) rotate(${(1 - vs) * 90}deg)`, boxShadow: "0 0 60px rgba(0,0,0,0.6)" }}>VS</div>
      </AbsoluteFill>
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

/** "Theory 3 of 5" style card: the number flips in, then the heading types up. */
export const ListScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const v = useVertical();
  const flip = ease(interpolate(frame, [0, 18], [0, 1], clamp));
  const idx = scene.index ?? 1, total = scene.total ?? Math.max(idx, 3);
  const head = scene.heading ?? "";
  const shown = Math.floor(interpolate(frame, [16, 16 + head.length * 1.2], [0, head.length], clamp));
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${T.ocean}, ${T.oceanLight})`, justifyContent: "center", alignItems: "center", perspective: 1400 }}>
      <AbsoluteFill style={{ opacity: 0.08 }}>
        <div style={{ fontFamily: T.display, fontSize: v ? 1100 : 1000, color: T.white, position: "absolute", right: -40, bottom: -200, lineHeight: 1,
          transform: `translateX(${-frame * 0.6}px)` }}>{idx}</div>
      </AbsoluteFill>
      <div style={{ display: "flex", flexDirection: v ? "column" : "row", alignItems: "center", gap: v ? 40 : 70, marginBottom: v ? 380 : 0 }}>
        <div style={{ width: v ? 330 : 360, height: v ? 330 : 360, borderRadius: 40, background: T.accent, display: "flex", justifyContent: "center", alignItems: "center",
          transform: `rotateY(${(1 - flip) * 180}deg)`, boxShadow: "0 30px 60px rgba(0,0,0,0.5)", backfaceVisibility: "hidden" }}>
          <span style={{ fontFamily: T.display, fontSize: v ? 240 : 260, color: T.white, lineHeight: 1 }}>{idx}</span>
        </div>
        <div style={{ maxWidth: v ? 940 : 1000, textAlign: v ? "center" : "left" }}>
          <div style={{ fontFamily: T.font, fontWeight: 800, fontSize: 40, color: T.accent2, letterSpacing: 6, opacity: flip }}>
            {/\d/.test(scene.caption ?? "") ? (scene.caption ?? "").toUpperCase() : `${(scene.caption ?? "").toUpperCase()} ${idx}`} / {total}
          </div>
          <div style={{ fontFamily: T.display, fontSize: v ? 104 : 116, color: T.white, lineHeight: 1.02, minHeight: 120 }}>{head.slice(0, shown)}</div>
          {scene.subheading && <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 44, color: T.landDim, marginTop: 20, opacity: interpolate(frame, [30, 45], [0, 1], clamp) }}>{scene.subheading}</div>}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: v ? 420 : 200, display: "flex", gap: 18 }}>
        {[...Array(total)].map((_, i) => <div key={i} style={{ width: i + 1 === idx ? 60 : 22, height: 22, borderRadius: 11, background: i + 1 <= idx ? T.accent2 : "rgba(255,255,255,0.25)" }} />)}
      </div>
      {scene.icon && <div style={{ position: "absolute", top: v ? 330 : 120, right: v ? 80 : 160 }}><Icon icon={scene.icon} size={150} delay={10} /></div>}
    </AbsoluteFill>
  );
};
