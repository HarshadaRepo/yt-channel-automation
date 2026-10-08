import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Spring that starts at `delay` frames. */
export const usePop = (delay = 0, damping = 12) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
};

/** Slowly drifting particles over a dark gradient: keeps every frame moving. */
export const AnimatedBackground: React.FC<{ seed?: string; tint?: string }> = ({ seed = "bg", tint = T.oceanLight }) => {
  const frame = useCurrentFrame();
  const dots = new Array(40).fill(0).map((_, i) => {
    const x = random(`${seed}x${i}`) * 1920;
    const y = random(`${seed}y${i}`) * 1080;
    const r = 2 + random(`${seed}r${i}`) * 5;
    const speed = 0.2 + random(`${seed}s${i}`) * 0.6;
    return { x: (x + frame * speed) % 1960 - 20, y: y - Math.sin((frame + i * 20) / 60) * 15, r, o: 0.15 + random(`${seed}o${i}`) * 0.3 };
  });
  const angle = 120 + Math.sin(frame / 90) * 20;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${T.ocean} 0%, ${tint} 100%)` }}>
      <svg width={1920} height={1080}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={T.accent2} opacity={d.o} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/** Emoji "character" that bobs and wiggles so it feels alive. */
export const Icon: React.FC<{ icon: string; size: number; delay?: number; style?: React.CSSProperties }> = ({ icon, size, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const pop = usePop(delay, 9);
  const bob = Math.sin((frame - delay) / 9) * size * 0.05;
  const tilt = Math.sin((frame - delay) / 14) * 6;
  return (
    <div style={{ fontFamily: T.emoji, fontSize: size, lineHeight: 1, transform: `translateY(${bob}px) rotate(${tilt}deg) scale(${pop})`, ...style }}>
      {icon}
    </div>
  );
};

/** Captions: ~7 words at a time, current word highlighted (timed by word share of the scene). */
export const Captions: React.FC<{ text: string; duration: number }> = ({ text, duration }) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const weights = words.map((w) => w.length + 2 + (/[.,;:!?]$/.test(w) ? 6 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const speechFrames = Math.max(1, duration - 10);
  let acc = 0;
  const starts = weights.map((w) => {
    const s = (acc / total) * speechFrames;
    acc += w;
    return s;
  });
  let cur = starts.findIndex((s, i) => frame >= s && (i === words.length - 1 || frame < starts[i + 1]));
  if (cur < 0) cur = words.length - 1;
  const chunk = 7;
  const c0 = Math.floor(cur / chunk) * chunk;
  const shown = words.slice(c0, c0 + chunk);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 70 }}>
      <div style={{ background: "rgba(10,14,22,0.72)", borderRadius: 18, padding: "14px 30px", maxWidth: 1500, textAlign: "center",
        fontFamily: T.font, fontWeight: 600, fontSize: 46, color: T.white, lineHeight: 1.25 }}>
        {shown.map((w, i) => (
          <span key={i} style={{ color: c0 + i === cur ? T.accent2 : T.white }}>{w} </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Chip in the top-left naming what's on screen. */
export const Chip: React.FC<{ text?: string }> = ({ text }) => {
  const pop = usePop(6);
  if (!text) return null;
  return (
    <div style={{ position: "absolute", top: 60, left: 70, transform: `translateX(${(1 - pop) * -400}px)`, opacity: pop,
      background: T.accent, color: T.white, fontFamily: T.display, fontSize: 64, letterSpacing: 2, padding: "6px 26px", borderRadius: 10,
      boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}>
      {text}
    </div>
  );
};

export const Watermark: React.FC<{ channel: string }> = ({ channel }) => (
  <div style={{ position: "absolute", top: 40, right: 60, fontFamily: T.display, fontSize: 36, letterSpacing: 3, color: "rgba(255,255,255,0.55)" }}>
    {channel}
  </div>
);

/** Every scene enters with a quick zoom-and-fade so cuts never feel static. */
export const Enter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8], [0, 1], clamp);
  const s = interpolate(frame, [0, 12], [1.06, 1], clamp);
  return <AbsoluteFill style={{ opacity: o, transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};
