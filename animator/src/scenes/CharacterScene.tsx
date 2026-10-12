import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";
import { Chip, clamp } from "../common";
import type { Scene } from "../types";

// The channel's talking host: a plain, friendly round-head cartoon person in a t-shirt, the same
// look in every video. Hats (2026-10-12) asked for no costumes, beards or long robes, and nothing
// that marks a religion, ethnicity or race. Two-person exchanges use a second host who differs only
// in hair and shirt colour. The mouth follows the narration (scene.mouth, one value per frame).

type Mood = NonNullable<Scene["expression"]>;

const OUT = "#1d1a22";
const SKIN = "#f6cfa4";

const HOSTS = [
  { shirt: "#2f8f9d", collar: "#226b75", hair: "#3a2a20" },
  { shirt: "#e0703a", collar: "#b2552a", hair: "#6b3d22" },
];

const BROWS: Record<Mood, [number, number]> = {
  // [inner-end lift, outer-end lift] in units; positive = up
  neutral: [0, 0], happy: [6, 2], shocked: [22, 14], angry: [-18, 8], worried: [18, -6], thinking: [10, -4], smug: [-6, 10],
};

/** Short, simple hair: a neat crop for the first host, a side-swept fringe for the second. */
const Hair: React.FC<{ host: number }> = ({ host }) => {
  const c = HOSTS[host].hair;
  const s = { stroke: OUT, strokeWidth: 8, strokeLinejoin: "round" as const, fill: c };
  return host === 0
    ? <path d="M -150 -640 Q -165 -790 0 -800 Q 165 -790 150 -640 Q 140 -715 70 -735 Q 0 -700 -70 -735 Q -140 -715 -150 -640 Z" {...s} />
    : <path d="M -152 -620 Q -170 -800 10 -805 Q 170 -795 152 -620 Q 150 -700 110 -720 Q 20 -690 -60 -745 Q -120 -700 -152 -620 Z" {...s} />;
};

const Face: React.FC<{ mood: Mood; mouth: number; blink: number; look: number }> = ({ mood, mouth, blink, look }) => {
  const [inner, outer] = BROWS[mood];
  const big = mood === "shocked" ? 1.25 : 1;
  const open = 12 + mouth * 80 * (mood === "shocked" ? 1.3 : 1);
  const curve = mood === "happy" || mood === "smug" ? 26 : mood === "angry" || mood === "worried" ? -18 : 6;
  const w = mood === "shocked" ? 34 : 58;
  return (
    <g stroke={OUT} strokeLinecap="round" strokeLinejoin="round">
      {/* eyes */}
      {[-1, 1].map((k) => (
        <g key={k} transform={`translate(${k * 58},-640)`}>
          <ellipse rx={30 * big} ry={Math.max(3, 38 * big * blink)} fill="#fff" strokeWidth={6} />
          {blink > 0.3 && <circle cx={look * 12} cy={4} r={14 / big} fill={OUT} stroke="none" />}
          {blink > 0.3 && <circle cx={look * 12 + 5} cy={-2} r={4} fill="#fff" stroke="none" />}
          {mood === "smug" && <path d={`M -34 -8 L 34 -8`} strokeWidth={8} />}
        </g>
      ))}
      {/* brows */}
      {[-1, 1].map((k) => (
        <path key={k} d={`M ${k * 22} ${-700 - inner} L ${k * 92} ${-700 - outer}`} strokeWidth={14} />
      ))}
      {/* nose */}
      <path d="M -6 -620 Q 14 -585 -10 -578" fill="none" strokeWidth={6} />
      {/* mouth: opens with the narration, shaped by mood */}
      <path d={`M ${-w} -545 Q 0 ${-545 + curve} ${w} -545 Q 0 ${-545 + curve + open} ${-w} -545 Z`}
        fill="#5a1f24" strokeWidth={7} />
      {open > 22 && <path d={`M ${-w * 0.5} ${-545 + curve * 0.5 + open * 0.75} Q 0 ${-545 + curve * 0.5 + open * 0.45} ${w * 0.5} ${-545 + curve * 0.5 + open * 0.75}`}
        fill="#e06a73" stroke="none" />}
      {mood === "worried" && <path d="M 150 -700 q 14 30 0 44 q -14 -14 0 -44 Z" fill="#9fd8ff" strokeWidth={4} />}
      {(mood === "happy" || mood === "smug") && [-1, 1].map((k) => <ellipse key={k} cx={k * 100} cy={-575} rx={26} ry={14} fill="#ff8a8a" opacity={0.45} stroke="none" />)}
    </g>
  );
};

const Character: React.FC<{
  host: number; mood: Mood; x: number; s: number; flip: boolean; frame: number; mouth: number; enter: number; seed: number; H: number; gesture: number;
}> = ({ host, mood, x, s, flip, frame, mouth, enter, seed, H, gesture }) => {
  const c = { body: HOSTS[host].shirt, trim: HOSTS[host].collar };
  const skin = SKIN;
  const blinkPhase = (frame + seed * 37) % 110;
  const blink = blinkPhase < 4 ? Math.abs(blinkPhase - 2) / 2 : 1;
  const breathe = Math.sin(frame / 22 + seed) * 6;
  const sway = Math.sin(frame / 40 + seed) * 1.5 + (mood === "shocked" ? -3 : 0);
  const up = (1 - enter) * 900;
  // arms: shoulder -> elbow -> hand, blending between a resting and a raised pose
  const arm = (k: number, g: number) => {
    const sx = k * 175, sy = -400;
    const rest = { ex: k * 230, ey: -210, hx: k * 190, hy: -40 };
    const raise = mood === "thinking" && k < 0
      ? { ex: k * 170, ey: -230, hx: k * 120, hy: -470 }
      : { ex: k * 300, ey: -330, hx: k * 270, hy: -530 };
    const p = (a: number, b: number) => a + (b - a) * g;
    return { sx, sy, ex: p(rest.ex, raise.ex), ey: p(rest.ey, raise.ey), hx: p(rest.hx, raise.hx), hy: p(rest.hy, raise.hy) };
  };
  const arms = [arm(-1, mood === "thinking" ? 1 : gesture * 0.4), arm(1, mood === "shocked" ? 0.85 : gesture)];
  return (
    <g transform={`translate(${x},${(H > 1500 ? H * 0.68 : H) + up}) scale(${flip ? -s : s},${s}) rotate(${sway})`}>
      {/* trousers, then a t-shirt that ends at the hips */}
      <path d="M -225 160 L -235 900 L -20 900 L 0 330 L 20 900 L 235 900 L 225 160 Z" fill="#3b4256" stroke={OUT} strokeWidth={9} strokeLinejoin="round" />
      <path d={`M -250 230 L -250 40 Q -250 -330 -175 -${420 + breathe} Q 0 -${470 + breathe} 175 -${420 + breathe} Q 250 -330 250 40 L 250 230 Q 0 260 -250 230 Z`} fill={c.body} stroke={OUT} strokeWidth={9} />
      <path d={`M -70 -${445 + breathe} L 0 -330 L 70 -${445 + breathe}`} fill="none" stroke={c.trim} strokeWidth={22} strokeLinejoin="round" />
      {/* neck + head */}
      <rect x={-45} y={-500} width={90} height={80} fill={skin} stroke={OUT} strokeWidth={8} />
      <ellipse cx={0} cy={-620} rx={150} ry={165} fill={skin} stroke={OUT} strokeWidth={9} />
      {[-1, 1].map((k) => <ellipse key={k} cx={k * 150} cy={-615} rx={22} ry={34} fill={skin} stroke={OUT} strokeWidth={7} />)}
      <Face mood={mood} mouth={mouth} blink={blink} look={flip ? -0.6 : 0.6} />
      <Hair host={host} />
      {/* arms on top so gestures read clearly */}
      {arms.map((a, i) => (
        <g key={i}>
          <path d={`M ${a.sx} ${a.sy} L ${a.ex} ${a.ey} L ${a.hx} ${a.hy}`} fill="none" stroke={OUT} strokeWidth={84} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${a.sx} ${a.sy} L ${a.ex} ${a.ey} L ${a.hx} ${a.hy}`} fill="none" stroke={c.body} strokeWidth={68} strokeLinecap="round" strokeLinejoin="round" />
          <g transform={`translate(${a.hx},${a.hy})`}>
            <circle r={40} fill={skin} stroke={OUT} strokeWidth={8} />
          </g>
        </g>
      ))}
    </g>
  );
};

/** Speech bubble whose text types itself in. */
const Bubble: React.FC<{ text: string; x: number; y: number; w: number; start: number; tailLeft: boolean; size: number }> = ({ text, x, y, w, start, tailLeft, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - start, fps, config: { damping: 11, mass: 0.5 } });
  const shown = text.slice(0, Math.max(0, Math.floor((frame - start - 4) * 1.4)));
  if (frame < start) return null;
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, transform: `scale(${pop})`, transformOrigin: tailLeft ? "10% 100%" : "90% 100%",
      background: "#fff", color: OUT, border: `6px solid ${OUT}`, borderRadius: 36, padding: "26px 34px",
      fontFamily: T.font, fontWeight: 700, fontSize: size, lineHeight: 1.2, boxShadow: "0 12px 0 rgba(0,0,0,0.25)",
    }}>
      <span>{shown}</span><span style={{ opacity: 0 }}>{text.slice(shown.length)}</span>
      <svg width={70} height={60} style={{ position: "absolute", bottom: -54, [tailLeft ? "left" : "right"]: 60 }}>
        <path d={tailLeft ? "M 0 0 L 20 52 L 60 0" : "M 70 0 L 50 52 L 10 0"} fill="#fff" stroke={OUT} strokeWidth={6} />
        <rect x={0} y={-6} width={70} height={8} fill="#fff" />
      </svg>
    </div>
  );
};

export const CharacterScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const v = H > W;
  const mood = (scene.expression ?? "neutral") as Mood;
  const two = !!(scene.reply || scene.role2);
  const D = scene.durationInFrames;
  const replyAt = Math.round(D * 0.5);
  // The narrator's loudness drives the mouth; with two characters, each talks during "their" half.
  const level = scene.mouth?.[frame] ?? (0.5 + 0.5 * Math.sin(frame * 1.7)) * (frame % 40 < 30 ? 1 : 0);
  const speaking2 = two && frame >= replyAt;
  const enter1 = spring({ frame, fps, config: { damping: 13, mass: 0.7 } });
  const enter2 = spring({ frame: frame - 8, fps, config: { damping: 13, mass: 0.7 } });
  // gestures come in beats: raise, hold, lower, a few times a scene
  const beat = (f: number) => {
    const p = ((f + 20) % 75) / 75;
    return p < 0.15 ? p / 0.15 : p < 0.55 ? 1 : p < 0.7 ? 1 - (p - 0.55) / 0.15 : 0;
  };
  const s = v ? (two ? 0.72 : 1.0) : two ? 0.88 : 1.0;
  const rot = frame * 0.15;
  const bubbleSize = v ? 48 : 40;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, ${T.oceanLight} 0%, ${T.ocean} 75%)` }}>
      {/* sunburst behind the characters keeps the frame moving */}
      <svg width={W} height={H} style={{ position: "absolute" }}>
        <g transform={`translate(${W / 2},${H * 0.55}) rotate(${rot})`}>
          {[...Array(18)].map((_, i) => (
            <path key={i} d={`M 0 0 L ${Math.cos((i * 20) * Math.PI / 180) * W * 1.5} ${Math.sin((i * 20) * Math.PI / 180) * W * 1.5} L ${Math.cos((i * 20 + 9) * Math.PI / 180) * W * 1.5} ${Math.sin((i * 20 + 9) * Math.PI / 180) * W * 1.5} Z`}
              fill={T.accent2} opacity={0.06} />
          ))}
        </g>
        <ellipse cx={W / 2} cy={H - 20} rx={W * 0.6} ry={70} fill="#000" opacity={0.25} />
        {two ? <>
          <Character host={0} mood={mood} x={W * (v ? 0.3 : 0.27)} s={s} flip={false} frame={frame} mouth={speaking2 ? 0 : level} enter={enter1} seed={1} H={H} gesture={speaking2 ? 0 : beat(frame)} />
          <Character host={1} mood={(scene.expression2 ?? "neutral") as Mood} x={W * (v ? 0.7 : 0.73)} s={s} flip frame={frame}
            mouth={speaking2 ? level : 0} enter={enter2} seed={2} H={H} gesture={speaking2 ? beat(frame - replyAt) : 0} />
        </> : <Character host={0} mood={mood} x={W * (v ? 0.5 : 0.62)} s={s} flip={false} frame={frame} mouth={level} enter={enter1} seed={1} H={H} gesture={beat(frame)} />}
      </svg>
      {scene.speech && (two
        ? <Bubble text={scene.speech} x={v ? 40 : W * 0.04} y={v ? 340 : 190} w={v ? W * 0.62 : W * 0.34} start={10} tailLeft size={bubbleSize} />
        : <Bubble text={scene.speech} x={v ? 60 : W * 0.06} y={v ? 340 : H * 0.22} w={v ? W - 120 : W * 0.4} start={10} tailLeft={!v} size={bubbleSize + 6} />)}
      {two && scene.reply && (
        <Bubble text={scene.reply} x={v ? W * 0.34 : W * 0.6} y={v ? 560 : 190} w={v ? W * 0.62 : W * 0.34} start={replyAt} tailLeft={false} size={bubbleSize} />
      )}
      {scene.label && !scene.speech && (
        <div style={{
          position: "absolute", left: v ? 0 : W * 0.06, right: v ? 0 : undefined, top: v ? 340 : H * 0.3, width: v ? W : W * 0.36,
          textAlign: v ? "center" : "left", fontFamily: T.display, fontSize: v ? 96 : 104, color: T.white, lineHeight: 1,
          opacity: interpolate(frame, [8, 20], [0, 1], clamp), textShadow: "0 6px 24px rgba(0,0,0,0.5)",
        }}>{scene.label}</div>
      )}
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};
