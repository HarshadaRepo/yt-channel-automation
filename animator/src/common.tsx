import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** True when rendering a vertical Short. */
export const useVertical = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

/** Spring that starts at `delay` frames. */
export const usePop = (delay = 0, damping = 12) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
};

/** Slowly drifting particles over a dark gradient: keeps every frame moving. */
export const AnimatedBackground: React.FC<{ seed?: string; tint?: string }> = ({ seed = "bg", tint = T.oceanLight }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const dots = new Array(40).fill(0).map((_, i) => {
    const x = random(`${seed}x${i}`) * W;
    const y = random(`${seed}y${i}`) * H;
    const r = 2 + random(`${seed}r${i}`) * 5;
    const speed = 0.2 + random(`${seed}s${i}`) * 0.6;
    return { x: (x + frame * speed) % (W + 40) - 20, y: y - Math.sin((frame + i * 20) / 60) * 15, r, o: 0.15 + random(`${seed}o${i}`) * 0.3 };
  });
  const angle = 120 + Math.sin(frame / 90) * 20;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${T.ocean} 0%, ${tint} 100%)` }}>
      <svg width={W} height={H}>
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
  const v = useVertical();
  // Voice cues like <short pause> are for the narrator, not the screen.
  const words = text.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean);
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
  const chunk = v ? 4 : 7;
  const c0 = Math.floor(cur / chunk) * chunk;
  const shown = words.slice(c0, c0 + chunk);
  return (
    // Shorts: big bold captions above the bottom UI (title, buttons) of the Shorts player.
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: v ? 470 : 70 }}>
      <div style={{ background: "rgba(10,14,22,0.72)", borderRadius: 18, padding: v ? "18px 34px" : "14px 30px", maxWidth: v ? 960 : 1500,
        textAlign: "center", fontFamily: T.font, fontWeight: v ? 800 : 600, fontSize: v ? 66 : 46, color: T.white, lineHeight: 1.25 }}>
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
  const v = useVertical();
  if (!text) return null;
  return (
    <div style={{ position: "absolute", top: v ? 250 : 60, left: v ? 60 : 70, maxWidth: v ? 960 : undefined, transform: `translateX(${(1 - pop) * -400}px)`, opacity: pop,
      background: T.accent, color: T.white, fontFamily: T.display, fontSize: 64, letterSpacing: 2, padding: "6px 26px", borderRadius: 10,
      boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}>
      {text}
    </div>
  );
};

export const Watermark: React.FC<{ channel: string }> = ({ channel }) => (
  <div style={{ position: "absolute", top: useVertical() ? 150 : 40, right: 60, fontFamily: T.display, fontSize: 36, letterSpacing: 3, color: "rgba(255,255,255,0.55)" }}>
    {channel}
  </div>
);

/** Scene entrance: the style's transition, plus a slow push-in so 2D scenes never sit still. */
export const Enter: React.FC<{ children: React.ReactNode; index?: number; still?: boolean; duration?: number }> = ({ children, index = 0, still, duration = 300 }) => {
  const frame = useCurrentFrame();
  const { width: W } = useVideoConfig();
  if (still) return <AbsoluteFill>{children}</AbsoluteFill>;
  const t = interpolate(frame, [0, 14], [0, 1], clamp);
  const e = ease(t);
  const drift = interpolate(frame, [0, duration], [0, 0.035], clamp);
  let style: React.CSSProperties = {};
  switch (T.transition) {
    case "slide":
      style = { transform: `translateX(${(1 - e) * (index % 2 ? -1 : 1) * W * 0.25}px) scale(${1 + drift})`, opacity: t };
      break;
    case "iris":
      style = { clipPath: `circle(${e * 110}% at 50% 50%)`, transform: `scale(${1 + drift})` };
      break;
    case "blur":
      style = { filter: `blur(${(1 - e) * 18}px)`, opacity: t, transform: `scale(${1.04 - e * 0.04 + drift})` };
      break;
    case "flash":
      style = { opacity: t, transform: `scale(${1.1 - e * 0.1 + drift})` };
      break;
    case "zoom":
    default:
      style = { opacity: t, transform: `scale(${1.06 - e * 0.06 + drift})` };
  }
  const flash = T.transition === "flash" ? interpolate(frame, [0, 3, 10], [0, 0.85, 0], clamp) : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
};

let NOISE = "";
const noiseTile = () => {
  if (NOISE) return NOISE;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = Math.floor(random(`n${i}`) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  NOISE = c.toDataURL("image/png");
  return NOISE;
};

/** Film grain / paper / scanline overlay from the active look. */
export const Texture: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const vignette = <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)" }} />;
  if (T.texture === "scanlines") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 2px, transparent 4px)" }} />
        {vignette}
      </AbsoluteFill>
    );
  }
  if (T.texture === "none") return <AbsoluteFill style={{ pointerEvents: "none" }}>{vignette}</AbsoluteFill>;
  const paper = T.texture === "paper";
  // A small pre-made noise tile, shifted every frame: looks like film grain but costs almost nothing
  // (an animated SVG turbulence filter made renders four times slower).
  const off = paper ? "0px 0px" : `${Math.floor(random(`g${frame}`) * 256)}px ${Math.floor(random(`h${frame}`) * 256)}px`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ backgroundImage: `url(${noiseTile()})`, backgroundPosition: off, opacity: paper ? 0.07 : 0.05 }} />
      {paper && <AbsoluteFill style={{ background: "rgba(120,80,30,0.07)" }} />}
      {vignette}
    </AbsoluteFill>
  );
};
