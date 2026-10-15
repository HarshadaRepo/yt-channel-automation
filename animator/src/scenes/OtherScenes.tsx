import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { T } from "../theme";
import { AnimatedBackground, Chip, Icon, clamp, ease, usePop, useVertical } from "../common";
import type { Scene } from "../types";

export const TitleScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const v = useVertical();
  const words = (scene.heading ?? "").split(" ");
  const sub = interpolate(frame, [words.length * 4 + 15, words.length * 4 + 30], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <AnimatedBackground seed={scene.heading} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 20, paddingBottom: v ? 380 : 0 }}>
        {scene.icon && <Icon icon={scene.icon} size={v ? 240 : 220} />}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", maxWidth: v ? 960 : 1600, gap: "0 28px" }}>
          {words.map((w, i) => {
            const t = interpolate(frame, [8 + i * 4, 20 + i * 4], [0, 1], clamp);
            return (
              <span key={i} style={{ fontFamily: T.display, fontSize: v ? 140 : 150, lineHeight: 1.0, color: i % 3 === 2 ? T.accent2 : T.white,
                transform: `translateY(${(1 - ease(t)) * 80}px)`, opacity: t, display: "inline-block", textShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
                {w}
              </span>
            );
          })}
        </div>
        {scene.subheading && (
          <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 48, color: T.landDim, opacity: sub, maxWidth: v ? 940 : 1600, textAlign: "center" }}>{scene.subheading}</div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const StatScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const t = ease(interpolate(frame, [10, Math.min(70, scene.durationInFrames * 0.6)], [0, 1], clamp));
  const v = (scene.value ?? 0) * t;
  const dec = Math.abs(scene.value ?? 0) < 10 && !Number.isInteger(scene.value) ? 1 : 0;
  const shown = v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const done = interpolate(frame, [70, 80], [1, 1.08], clamp) - interpolate(frame, [80, 90], [0, 0.08], clamp);
  const pop = usePop(0);
  const vert = useVertical();
  const len = `${scene.prefix ?? ""}${shown}${scene.suffix ?? ""}`.length;
  const big = vert ? Math.min(240, 1700 / Math.max(4, len)) : 260;
  return (
    <AbsoluteFill>
      <AnimatedBackground seed={scene.label} tint="#2a1f3a" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        {scene.icon && <Icon icon={scene.icon} size={170} delay={4} />}
        <div style={{ fontFamily: T.display, fontSize: big, color: T.accent2, transform: `scale(${pop * done})`, lineHeight: 1 }}>
          {scene.prefix}{shown}{scene.suffix}
        </div>
        <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: vert ? 60 : 56, color: T.white, maxWidth: vert ? 940 : 1400, textAlign: "center",
          marginBottom: vert ? 220 : 0, opacity: interpolate(frame, [20, 35], [0, 1], clamp) }}>
          {scene.label}
        </div>
      </AbsoluteFill>
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

export const TimelineScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const ev = scene.events ?? [];
  const D = scene.durationInFrames;
  const line = ease(interpolate(frame, [5, 40], [0, 1], clamp));
  const x0 = 200;
  const x1 = 1720;
  const step = (x1 - x0) / Math.max(1, ev.length - 1);
  const at = (i: number) => Math.round(30 + (i * (D - 60)) / Math.max(1, ev.length));
  const cur = ev.reduce((c, _, i) => (frame >= at(i) ? i : c), -1);
  if (useVertical()) {
    // Shorts: a top-to-bottom timeline with the labels to the right.
    const y0 = 420;
    const y1 = 1340;
    const vstep = (y1 - y0) / Math.max(1, ev.length - 1);
    return (
      <AbsoluteFill>
        <AnimatedBackground seed="timeline" />
        <svg width={1080} height={1920} style={{ position: "absolute" }}>
          <line x1={170} y1={y0} x2={170} y2={y0 + (y1 - y0) * line} stroke={T.land} strokeWidth={8} strokeLinecap="round" />
        </svg>
        {ev.map((e, i) => {
          const y = ev.length === 1 ? 880 : y0 + i * vstep;
          const show = interpolate(frame, [at(i), at(i) + 12], [0, 1], clamp);
          const active = i === cur;
          return (
            <React.Fragment key={i}>
              <div style={{ position: "absolute", left: 148, top: y - 22, width: 44, height: 44, borderRadius: 22,
                background: active ? T.accent : T.land, border: `6px solid ${T.white}`, transform: `scale(${show * (active ? 1.3 : 1)})` }} />
              <div style={{ position: "absolute", left: 230, top: y - 70, width: 780, display: "flex", alignItems: "center", gap: 24, opacity: show,
                transform: `translateX(${(1 - show) * 40}px) scale(${active ? 1.05 : 0.95})`, transformOrigin: "left center" }}>
                {e.icon && <Icon icon={e.icon} size={100} delay={at(i)} />}
                <div>
                  <div style={{ fontFamily: T.display, fontSize: 96, color: active ? T.accent2 : T.white, lineHeight: 1 }}>{e.year}</div>
                  <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 40, color: T.white, opacity: active ? 1 : 0.75 }}>{e.label}</div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <Chip text={scene.caption} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AnimatedBackground seed="timeline" />
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <line x1={x0} y1={470} x2={x0 + (x1 - x0) * line} y2={470} stroke={T.land} strokeWidth={8} strokeLinecap="round" />
      </svg>
      {ev.map((e, i) => {
        const x = ev.length === 1 ? 960 : x0 + i * step;
        const show = interpolate(frame, [at(i), at(i) + 12], [0, 1], clamp);
        const active = i === cur;
        const up = i % 2 === 0;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: x - 22, top: 448, width: 44, height: 44, borderRadius: 22,
              background: active ? T.accent : T.land, border: `6px solid ${T.white}`, transform: `scale(${show * (active ? 1.3 : 1)})` }} />
            <div style={{ position: "absolute", left: x - 180, width: 360, top: up ? 150 : 530, textAlign: "center", opacity: show,
              transform: `translateY(${(1 - show) * (up ? -30 : 30)}px) scale(${active ? 1.08 : 0.95})` }}>
              {up && e.icon && <Icon icon={e.icon} size={90} delay={at(i)} style={{ marginBottom: 8 }} />}
              <div style={{ fontFamily: T.display, fontSize: 84, color: active ? T.accent2 : T.white, lineHeight: 1 }}>{e.year}</div>
              <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 32, color: T.white, opacity: active ? 1 : 0.7 }}>{e.label}</div>
              {!up && e.icon && <Icon icon={e.icon} size={90} delay={at(i)} style={{ marginTop: 8 }} />}
            </div>
          </React.Fragment>
        );
      })}
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

export const CompareScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const items = scene.items ?? [];
  const max = Math.max(1, ...items.map((i) => i.value));
  const v = useVertical();
  const gap = (v ? 820 : 760) / Math.max(1, items.length);
  if (v) {
    // Shorts: label above each bar, bars run the full width.
    return (
      <AbsoluteFill>
        <AnimatedBackground seed="compare" tint="#1f3a2e" />
        {items.map((it, i) => {
          const d = 10 + i * 18;
          const t = ease(interpolate(frame, [d, d + 40], [0, 1], clamp));
          return (
            <div key={i} style={{ position: "absolute", top: 380 + i * gap, left: 70, width: 940 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: T.font, fontWeight: 800, fontSize: 46, color: T.white }}>
                {it.icon && <Icon icon={it.icon} size={70} delay={d + 30} />}
                {it.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
                <div style={{ height: 90, width: Math.max(4, (it.value / max) * 640 * t), borderRadius: 14,
                  background: i === 0 ? T.accent : T.land, boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }} />
                <div style={{ fontFamily: T.display, fontSize: 76, color: T.accent2, opacity: t }}>
                  {Math.round(it.value * t).toLocaleString("en-US")} {scene.unit}
                </div>
              </div>
            </div>
          );
        })}
        <Chip text={scene.caption} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AnimatedBackground seed="compare" tint="#1f3a2e" />
      {items.map((it, i) => {
        const d = 10 + i * 18;
        const t = ease(interpolate(frame, [d, d + 40], [0, 1], clamp));
        const w = (it.value / max) * 900 * t;
        const y = 220 + i * gap;
        return (
          <div key={i} style={{ position: "absolute", top: y, left: 120, display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 460, textAlign: "right", fontFamily: T.font, fontWeight: 800, fontSize: 38, color: T.white }}>{it.label}</div>
            <div style={{ height: Math.min(110, gap * 0.7), width: Math.max(4, w), borderRadius: 14,
              background: i === 0 ? T.accent : T.land, boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }} />
            {it.icon && <Icon icon={it.icon} size={70} delay={d + 30} />}
            <div style={{ fontFamily: T.display, fontSize: 70, color: T.accent2, opacity: t }}>
              {Math.round(it.value * t).toLocaleString("en-US")} {scene.unit}
            </div>
          </div>
        );
      })}
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

/** AI illustration with slow push-in and parallax (the shared Texture overlay supplies the vignette). Falls back to a title card when there's no image. */
export const ImageScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  if (!scene.src) return <TitleScene scene={{ ...scene, heading: scene.caption ?? scene.heading ?? "" }} />;
  // Slow Ken Burns move; the script picks the direction so consecutive pictures don't all drift the same way.
  const t = interpolate(frame, [0, scene.durationInFrames], [0, 1], clamp);
  const e = t * t * (3 - 2 * t);
  const cam = scene.camera ?? (["push", "flyover", "dolly", "orbit"] as const)[Math.floor(random(scene.src) * 4)];
  const s = cam === "push" ? 1.04 + 0.14 * e : cam === "dolly" ? 1.18 - 0.14 * e : 1.12;
  const x = cam === "flyover" ? 40 - 80 * e : cam === "orbit" ? -40 + 80 * e : 0;
  const y = cam === "push" || cam === "dolly" ? -10 * e : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: T.ocean }}>
      <Img src={staticFile(scene.src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s}) translate(${x}px, ${y}px)` }} />
    </AbsoluteFill>
  );
};
