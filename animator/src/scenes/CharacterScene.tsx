import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";
import { Chip, clamp } from "../common";
import type { Scene } from "../types";

// The channel's one talking host, the same in every video: a friendly young presenter in a hoodie,
// drawn in a soft, shaded cartoon style. Hats (2026-10-12) asked for a single, plain character
// with no costumes, beards or robes, and nothing that marks a religion, ethnicity or race.
// The mouth follows the narration (scene.mouth, one value per frame); eyes blink and follow the
// gestures, eyebrows and mouth shape follow `expression`.

type Mood = NonNullable<Scene["expression"]>;

const LINE = "#2a2230";
const SKIN = "#f4cba3";
const SKIN_SHADE = "#e2a985";
const HAIR = "#3b2a24";
const HAIR_LIGHT = "#5e463b";
const HOODIE = "#3f7fb0";
const HOODIE_SHADE = "#2f6390";
const HOODIE_LIGHT = "#5b9ac9";
const TEE = "#f5f1e8";
const JEANS = "#34394d";

const BROWS: Record<Mood, { lift: number; tilt: number }> = {
  // lift = whole brow up/down, tilt = inner end up (+) or down (-)
  neutral: { lift: 0, tilt: 0 }, happy: { lift: 8, tilt: 2 }, shocked: { lift: 30, tilt: 6 }, angry: { lift: -8, tilt: -16 },
  worried: { lift: 12, tilt: 16 }, thinking: { lift: 6, tilt: -6 }, smug: { lift: 0, tilt: -8 },
};

const Face: React.FC<{ mood: Mood; mouth: number; blink: number; look: number; frame: number }> = ({ mood, mouth, blink, look, frame }) => {
  const b = BROWS[mood];
  const wide = mood === "shocked" ? 1.18 : 1;
  const lid = mood === "smug" ? 0.62 : mood === "angry" ? 0.78 : 1; // half-closed eyes
  const open = 8 + mouth * 62 * (mood === "shocked" ? 1.35 : 1);
  const smile = mood === "happy" ? 22 : mood === "smug" ? 14 : mood === "worried" || mood === "angry" ? -12 : 8;
  const w = mood === "shocked" ? 30 : 46;
  const my = -548;
  // thinking: glance up and aside; otherwise look towards the raised hand
  const gx = mood === "thinking" ? 9 : look * 7;
  const gy = mood === "thinking" ? -9 : 2;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* eyes: white, iris, pupil, two highlights; the lid closes for blinks */}
      {[-1, 1].map((k) => {
        const ry = 40 * wide * blink * lid;
        return (
          <g key={k} transform={`translate(${k * 62},-636)`}>
            <ellipse rx={33 * wide} ry={Math.max(2, ry)} fill="#fff" stroke={LINE} strokeWidth={5} />
            {ry > 10 && <>
              <circle cx={gx} cy={gy + (1 - lid) * 10} r={21} fill="#6b4a32" />
              <circle cx={gx} cy={gy + (1 - lid) * 10} r={11} fill="#1e1612" />
              <circle cx={gx + 8} cy={gy - 8 + (1 - lid) * 10} r={6} fill="#fff" />
              <circle cx={gx - 7} cy={gy + 7 + (1 - lid) * 10} r={3} fill="#fff" opacity={0.8} />
              {/* upper lid line */}
              <path d={`M ${-34 * wide} ${-ry * 0.55} Q 0 ${-ry - 6} ${34 * wide} ${-ry * 0.55}`} fill="none" stroke={LINE} strokeWidth={9} />
            </>}
            {ry <= 10 && <path d={`M -34 0 Q 0 ${mood === "happy" ? -12 : 8} 34 0`} fill="none" stroke={LINE} strokeWidth={8} />}
          </g>
        );
      })}
      {/* brows: soft, thick, hair-coloured */}
      {[-1, 1].map((k) => (
        <path key={k}
          d={`M ${k * 30} ${-700 - b.lift - b.tilt} Q ${k * 62} ${-716 - b.lift} ${k * 96} ${-698 - b.lift + b.tilt * 0.3}`}
          fill="none" stroke={HAIR} strokeWidth={15} />
      ))}
      {/* nose */}
      <path d="M 4 -612 Q 18 -586 -2 -578" fill="none" stroke={SKIN_SHADE} strokeWidth={8} />
      {/* cheeks */}
      {[-1, 1].map((k) => <ellipse key={k} cx={k * 102} cy={-578} rx={26} ry={15} fill="#f08f86" opacity={mood === "happy" || mood === "smug" ? 0.5 : 0.28} />)}
      {/* mouth: opens with the narration, curved by mood */}
      <path d={`M ${-w} ${my} Q 0 ${my + smile} ${w} ${my} Q 0 ${my + smile + open} ${-w} ${my} Z`} fill="#6b2a2e" stroke={LINE} strokeWidth={6} />
      {open > 18 && <path d={`M ${-w * 0.62} ${my + smile * 0.35 + 3} Q 0 ${my + smile * 0.55 + 10} ${w * 0.62} ${my + smile * 0.35 + 3} L ${w * 0.5} ${my + smile * 0.3} Q 0 ${my + smile * 0.5} ${-w * 0.5} ${my + smile * 0.3} Z`} fill="#fff" />}
      {open > 26 && <ellipse cx={0} cy={my + smile * 0.5 + open * 0.62} rx={w * 0.45} ry={open * 0.16} fill="#e5747a" />}
      {mood === "worried" && <path d="M 158 -700 q 14 30 0 44 q -14 -14 0 -44 Z" fill="#a8dcff" stroke={LINE} strokeWidth={4} transform={`translate(0,${(frame % 60) * 0.4})`} />}
    </g>
  );
};

/** Modern short haircut with a soft quiff and a highlight. */
const Hair: React.FC = () => (
  <g strokeLinejoin="round">
    <path d="M -158 -610 Q -176 -760 -60 -805 Q 30 -840 110 -800 Q 175 -770 160 -610 Q 150 -690 112 -712 Q 60 -690 -20 -742 Q -40 -700 -112 -706 Q -150 -680 -158 -610 Z"
      fill={HAIR} stroke={LINE} strokeWidth={7} />
    <path d="M -70 -790 Q 10 -820 90 -786" fill="none" stroke={HAIR_LIGHT} strokeWidth={12} strokeLinecap="round" />
    <path d="M -128 -720 Q -120 -760 -84 -772" fill="none" stroke={HAIR_LIGHT} strokeWidth={8} strokeLinecap="round" />
  </g>
);

/** Mitten-style hand with a thumb; `open` spreads it for gestures. */
const Hand: React.FC<{ k: number; open: number }> = ({ k, open }) => (
  <g transform={`scale(${k},1) rotate(${-open * 20})`}>
    <ellipse cx={30} cy={-18} rx={17} ry={14} fill={SKIN} stroke={LINE} strokeWidth={6} />
    <ellipse cx={0} cy={0} rx={40} ry={37} fill={SKIN} stroke={LINE} strokeWidth={6} />
    <path d="M -18 -22 Q -8 -28 4 -24 M -22 -4 Q -10 -10 2 -6" fill="none" stroke={SKIN_SHADE} strokeWidth={5} strokeLinecap="round" />
  </g>
);

const Host: React.FC<{ mood: Mood; x: number; y: number; s: number; frame: number; mouth: number; enter: number; gesture: number }> = ({ mood, x, y, s, frame, mouth, enter, gesture }) => {
  const blinkPhase = frame % 105;
  const blink = blinkPhase < 4 ? Math.abs(blinkPhase - 2) / 2 : 1;
  const breathe = Math.sin(frame / 22) * 5;
  const sway = Math.sin(frame / 40) * 1.2 + (mood === "shocked" ? -2.5 : 0);
  const bob = Math.abs(Math.sin(frame / 9)) * mouth * 6; // a little nod while talking
  const up = (1 - enter) * 900;
  // arms: shoulder -> elbow -> hand, blending between a resting and a raised pose
  const arm = (k: number, g: number) => {
    const sx = k * 165, sy = -385;
    const rest = { ex: k * 235, ey: -190, hx: k * 205, hy: -20 };
    const raise = mood === "thinking" && k < 0
      ? { ex: k * 190, ey: -230, hx: k * 70, hy: -480 } // hand to chin
      : mood === "shocked"
        ? { ex: k * 290, ey: -440, hx: k * 215, hy: -660 } // hands up by the face
        : { ex: k * 305, ey: -300, hx: k * 285, hy: -500 };
    const p = (a: number, b: number) => a + (b - a) * g;
    return { sx, sy, ex: p(rest.ex, raise.ex), ey: p(rest.ey, raise.ey), hx: p(rest.hx, raise.hx), hy: p(rest.hy, raise.hy), g };
  };
  const arms = [
    arm(-1, mood === "thinking" || mood === "shocked" ? 1 : gesture * 0.35),
    arm(1, mood === "shocked" ? 1 : gesture),
  ];
  const sleeve = (a: ReturnType<typeof arm>) => `M ${a.sx} ${a.sy} Q ${a.ex} ${a.ey} ${a.hx + (a.ex - a.hx) * 0.2} ${a.hy + (a.ey - a.hy) * 0.2}`;
  return (
    <g transform={`translate(${x},${y + up}) scale(${s}) rotate(${sway})`}>
      <defs>
        <radialGradient id="hostFace" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fbdcbc" /><stop offset="70%" stopColor={SKIN} /><stop offset="100%" stopColor={SKIN_SHADE} />
        </radialGradient>
        <linearGradient id="hostHoodie" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={HOODIE_SHADE} /><stop offset="35%" stopColor={HOODIE} /><stop offset="70%" stopColor={HOODIE_LIGHT} /><stop offset="100%" stopColor={HOODIE} />
        </linearGradient>
      </defs>
      {/* jeans + trainers */}
      <path d="M -170 120 L -185 860 L -22 860 L 0 300 L 22 860 L 185 860 L 170 120 Z" fill={JEANS} stroke={LINE} strokeWidth={8} />
      <path d="M -215 850 Q -215 905 -120 905 L -10 905 Q 0 870 -30 850 Z M 215 850 Q 215 905 120 905 L 10 905 Q 0 870 30 850 Z" fill="#f2f2f2" stroke={LINE} strokeWidth={7} />
      {/* hood resting behind the neck */}
      <path d={`M -150 -${410 + breathe} Q 0 -${520 + breathe} 150 -${410 + breathe} Q 0 -${440 + breathe} -150 -${410 + breathe} Z`} fill={HOODIE_SHADE} stroke={LINE} strokeWidth={7} />
      {/* hoodie body */}
      <path d={`M -205 170 Q -218 0 -214 -250 Q -210 -370 -150 -${410 + breathe} Q 0 -${455 + breathe} 150 -${410 + breathe} Q 210 -370 214 -250 Q 218 0 205 170 Q 0 200 -205 170 Z`}
        fill="url(#hostHoodie)" stroke={LINE} strokeWidth={9} />
      {/* t-shirt at the neckline, ribbed hem, pocket, drawstrings */}
      <path d={`M -62 -${428 + breathe} Q 0 -330 62 -${428 + breathe} Q 0 -${405 + breathe} -62 -${428 + breathe} Z`} fill={TEE} stroke={LINE} strokeWidth={6} />
      <path d="M -207 135 Q 0 165 207 135 L 205 172 Q 0 202 -205 172 Z" fill={HOODIE_SHADE} stroke={LINE} strokeWidth={6} />
      <path d="M -110 10 L 110 10 L 135 120 Q 0 140 -135 120 Z" fill={HOODIE_SHADE} opacity={0.55} stroke={LINE} strokeWidth={5} />
      {[-1, 1].map((k) => (
        <g key={k}>
          <path d={`M ${k * 48} -${400 + breathe} Q ${k * 54} -300 ${k * 46} ${-220 + Math.sin(frame / 15 + k) * 4}`} fill="none" stroke="#f5f1e8" strokeWidth={9} strokeLinecap="round" />
          <rect x={k * 46 - 8} y={-222 + Math.sin(frame / 15 + k) * 4} width={16} height={26} rx={4} fill="#c9c2b4" stroke={LINE} strokeWidth={4} />
        </g>
      ))}
      {/* neck + head (nods slightly while talking) */}
      <g transform={`translate(0,${bob}) rotate(${mood === "thinking" ? -4 : 0} 0 -460) translate(0,-460) scale(1.18) translate(0,460)`}>
        <path d="M -48 -500 L -48 -425 Q 0 -400 48 -425 L 48 -500 Z" fill={SKIN_SHADE} stroke={LINE} strokeWidth={7} />
        {[-1, 1].map((k) => (
          <g key={k}>
            <ellipse cx={k * 152} cy={-618} rx={24} ry={36} fill={SKIN} stroke={LINE} strokeWidth={6} />
            <path d={`M ${k * 150} -632 q ${k * 10} 12 0 26`} fill="none" stroke={SKIN_SHADE} strokeWidth={6} strokeLinecap="round" />
          </g>
        ))}
        <path d="M -150 -650 Q -152 -790 0 -795 Q 152 -790 150 -650 Q 148 -540 92 -492 Q 45 -460 0 -460 Q -45 -460 -92 -492 Q -148 -540 -150 -650 Z"
          fill="url(#hostFace)" stroke={LINE} strokeWidth={8} />
        <Face mood={mood} mouth={mouth} blink={blink} look={arms[1].g > 0.5 ? 1 : 0.3} frame={frame} />
        <Hair />
      </g>
      {/* arms on top so gestures read clearly */}
      {arms.map((a, i) => (
        <g key={i}>
          <path d={sleeve(a)} fill="none" stroke={LINE} strokeWidth={86} strokeLinecap="round" />
          <path d={sleeve(a)} fill="none" stroke={i === 0 ? HOODIE_SHADE : HOODIE} strokeWidth={70} strokeLinecap="round" />
          <g transform={`translate(${a.hx},${a.hy})`}><Hand k={i === 0 ? -1 : 1} open={a.g} /></g>
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
      background: "#fff", color: LINE, border: `6px solid ${LINE}`, borderRadius: 36, padding: "26px 34px",
      fontFamily: T.font, fontWeight: 700, fontSize: size, lineHeight: 1.2, boxShadow: "0 12px 0 rgba(0,0,0,0.18)",
    }}>
      <span>{shown}</span><span style={{ opacity: 0 }}>{text.slice(shown.length)}</span>
      <svg width={70} height={60} style={{ position: "absolute", bottom: -54, [tailLeft ? "left" : "right"]: 60 }}>
        <path d={tailLeft ? "M 0 0 L 20 52 L 60 0" : "M 70 0 L 50 52 L 10 0"} fill="#fff" stroke={LINE} strokeWidth={6} />
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
  const level = scene.mouth?.[frame] ?? (0.5 + 0.5 * Math.sin(frame * 1.7)) * (frame % 40 < 30 ? 1 : 0);
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  // gestures come in beats: raise, hold, lower, a few times a scene
  const p = ((frame + 20) % 80) / 80;
  const beat = p < 0.15 ? p / 0.15 : p < 0.55 ? 1 : p < 0.7 ? 1 - (p - 0.55) / 0.15 : 0;
  // Older scripts may carry a second speaker's line; the host now says both.
  const speech = [scene.speech, scene.reply].filter(Boolean).join(" ");
  const zoom = interpolate(frame, [0, scene.durationInFrames], [1, 1.04]);
  const hx = W * (v ? 0.5 : 0.66);
  const hy = v ? H * 0.74 : H * 1.0;
  const s = v ? 1.05 : 0.95;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 60% 40%, #fbf3e3 0%, #f1e2c6 55%, #dcc49c 100%)", overflow: "hidden" }}>
      {/* a soft studio backdrop: paper colour, a warm glow behind the host, faint dots */}
      <svg width={W} height={H} style={{ position: "absolute", transform: `scale(${zoom})`, transformOrigin: `${hx}px ${hy}px` }}>
        <defs>
          <radialGradient id="hostGlow"><stop offset="0%" stopColor="#ffd98a" stopOpacity={0.55} /><stop offset="100%" stopColor="#ffd98a" stopOpacity={0} /></radialGradient>
          <pattern id="hostDots" width={46} height={46} patternUnits="userSpaceOnUse"><circle cx={23} cy={23} r={3} fill="#b89a6a" opacity={0.22} /></pattern>
        </defs>
        <rect width={W} height={H} fill="url(#hostDots)" />
        <circle cx={hx} cy={hy - (v ? 520 : 560) * s} r={W * (v ? 0.45 : 0.3)} fill="url(#hostGlow)" />
        <ellipse cx={hx} cy={v ? hy + 900 * s : H - 10} rx={W * (v ? 0.4 : 0.25)} ry={50} fill="#7a5a32" opacity={0.18} />
        <Host mood={mood} x={hx} y={hy} s={s} frame={frame} mouth={level} enter={enter} gesture={beat} />
      </svg>
      {speech && <Bubble text={speech} x={v ? 60 : W * 0.06} y={v ? 330 : H * 0.2} w={v ? W - 120 : W * 0.4} start={10} tailLeft={!v} size={v ? 54 : 46} />}
      {scene.label && !speech && (
        <div style={{
          position: "absolute", left: v ? 0 : W * 0.06, right: v ? 0 : undefined, top: v ? 340 : H * 0.3, width: v ? W : W * 0.36,
          textAlign: v ? "center" : "left", fontFamily: T.display, fontSize: v ? 96 : 104, color: LINE, lineHeight: 1,
          opacity: interpolate(frame, [8, 20], [0, 1], clamp),
        }}>{scene.label}</div>
      )}
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};
