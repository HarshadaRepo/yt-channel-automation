import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";
import { Chip, clamp } from "../common";
import type { Scene } from "../types";

// The channel's one talking host, the same in every video, drawn in the flat, colourful style of
// popular animated explainers: no outlines, bold shapes, a big symmetric head and big eyes.
// Hats (2026-10-12) asked for one plain, appealing, colourful character with no costume, beard
// or robe, and nothing that marks a religion, ethnicity or race.
// Every shape on the head and body is drawn once and mirrored, so the character is symmetric.
// The mouth follows the narration (scene.mouth, one value per frame); eyes blink and look at the
// raised hand; eyebrows and mouth shape follow `expression`.

type Mood = NonNullable<Scene["expression"]>;

const SKIN = "#ffd0ad";
const SKIN_SHADE = "#f3b48d";
const HAIR = "#4a2c25";
const HAIR_LIGHT = "#6d453a";
const TEE = "#ffc233";
const TEE_SHADE = "#f2a81d";
const SHIRT = "#2f9bd6";
const SHIRT_SHADE = "#2380b6";
const JEANS = "#3b4a8c";
const SHOE = "#ff6b4a";
const EYE = "#2d2a3a";
const MOUTH = "#7a1e2c";

const BROWS: Record<Mood, { lift: number; tilt: number }> = {
  // lift = brow up/down; tilt = degrees, inner end up (+) or down (-)
  neutral: { lift: 0, tilt: 0 }, happy: { lift: 8, tilt: 4 }, shocked: { lift: 26, tilt: 8 }, angry: { lift: -10, tilt: -18 },
  worried: { lift: 12, tilt: 18 }, thinking: { lift: 4, tilt: -8 }, smug: { lift: -2, tilt: -10 },
};

/** Draw the right half once and mirror it, so the shape is exactly symmetric. */
const Mirror: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}<g transform="scale(-1,1)">{children}</g></>
);

const Head: React.FC<{ mood: Mood; mouth: number; blink: number; look: number; frame: number }> = ({ mood, mouth, blink, look, frame }) => {
  const b = BROWS[mood];
  const wide = mood === "shocked" ? 1.15 : 1;
  const lid = mood === "smug" ? 0.6 : mood === "angry" ? 0.75 : 1;
  const open = mouth * 58 * (mood === "shocked" ? 1.3 : 1);
  const smile = mood === "happy" ? 26 : mood === "smug" ? 16 : mood === "worried" || mood === "angry" ? -10 : 12;
  const w = mood === "shocked" ? 36 : 56;
  const my = -562;
  const gx = mood === "thinking" ? 10 : look * 8;
  const gy = mood === "thinking" ? -10 : 3;
  const ry = 44 * wide * blink * lid;
  return (
    <g>
      {/* ears, face, soft jaw shade */}
      <Mirror>
        <circle cx={158} cy={-640} r={34} fill={SKIN} />
        <circle cx={160} cy={-640} r={16} fill={SKIN_SHADE} />
      </Mirror>
      <ellipse cx={0} cy={-650} rx={165} ry={160} fill={SKIN} />
      <path d="M -150 -590 Q 0 -470 150 -590 Q 120 -500 0 -490 Q -120 -500 -150 -590 Z" fill={SKIN_SHADE} opacity={0.35} />
      {/* hair: a symmetric rounded cut with a soft quiff */}
      <Mirror>
        <path d="M 0 -836 Q 178 -830 172 -650 Q 162 -720 122 -738 Q 62 -704 0 -726 Z" fill={HAIR} />
      </Mirror>
      <path d="M -30 -812 Q 20 -880 92 -838 Q 40 -846 18 -800 Z" fill={HAIR} />
      <path d="M -90 -800 Q -20 -838 60 -820" fill="none" stroke={HAIR_LIGHT} strokeWidth={12} strokeLinecap="round" />
      {/* eyes */}
      <Mirror>
        <g transform="translate(64,-642)">
          <ellipse rx={37 * wide} ry={Math.max(3, ry)} fill="#fff" />
          {ry > 12 && <>
            <circle cx={gx} cy={gy + (1 - lid) * 12} r={24} fill={EYE} />
            <circle cx={gx + 9} cy={gy - 9 + (1 - lid) * 12} r={8} fill="#fff" />
            <circle cx={gx - 8} cy={gy + 8 + (1 - lid) * 12} r={3.5} fill="#fff" opacity={0.8} />
            {lid < 1 && <rect x={-40} y={-ry - 4} width={80} height={ry * (1 - lid) + 18} rx={10} fill={SKIN} />}
          </>}
          {ry <= 12 && <path d="M -32 0 Q 0 -14 32 0" fill="none" stroke={EYE} strokeWidth={9} strokeLinecap="round" />}
        </g>
      </Mirror>
      {/* brows: rounded capsules, tilted by mood (the mirror flips the tilt for the other side) */}
      <Mirror>
        <rect x={30} y={-708 - b.lift} width={66} height={18} rx={9} fill={HAIR} transform={`rotate(${b.tilt} 30 ${-699 - b.lift})`} />
      </Mirror>
      {/* nose and cheeks */}
      <ellipse cx={0} cy={-602} rx={17} ry={12} fill={SKIN_SHADE} />
      <Mirror><ellipse cx={108} cy={-588} rx={27} ry={16} fill="#ff8a80" opacity={mood === "happy" || mood === "smug" ? 0.6 : 0.4} /></Mirror>
      {/* mouth: a smile line when closed, an open mouth with teeth and tongue while talking */}
      {open < 8
        ? <path d={`M ${-w * 0.8} ${my} Q 0 ${my + smile} ${w * 0.8} ${my}`} fill="none" stroke={MOUTH} strokeWidth={10} strokeLinecap="round" />
        : <g>
          <path d={`M ${-w} ${my} Q 0 ${my + smile * 0.6} ${w} ${my} Q ${w * 0.9} ${my + open + smile * 0.5} 0 ${my + open + smile * 0.6} Q ${-w * 0.9} ${my + open + smile * 0.5} ${-w} ${my} Z`} fill={MOUTH} />
          <path d={`M ${-w * 0.7} ${my + smile * 0.25 + 2} Q 0 ${my + smile * 0.55 + 4} ${w * 0.7} ${my + smile * 0.25 + 2} L ${w * 0.62} ${my + smile * 0.25 + 12} Q 0 ${my + smile * 0.55 + 14} ${-w * 0.62} ${my + smile * 0.25 + 12} Z`} fill="#fff" />
          {open > 22 && <ellipse cx={0} cy={my + open * 0.8 + smile * 0.45} rx={w * 0.5} ry={open * 0.18} fill="#ff6f79" />}
        </g>}
      {mood === "worried" && <path d="M 170 -720 q 14 30 0 44 q -14 -14 0 -44 Z" fill="#8fd3ff" transform={`translate(0,${(frame % 60) * 0.4})`} />}
    </g>
  );
};

const Host: React.FC<{ mood: Mood; x: number; y: number; s: number; frame: number; mouth: number; enter: number; gesture: number }> = ({ mood, x, y, s, frame, mouth, enter, gesture }) => {
  const blinkPhase = frame % 100;
  const blink = blinkPhase < 4 ? Math.abs(blinkPhase - 2) / 2 : 1;
  const breathe = Math.sin(frame / 20) * 4;
  const sway = Math.sin(frame / 42) * 1.2 + (mood === "shocked" ? Math.sin(frame * 1.3) * 0.8 : 0);
  const nod = mouth * 6;
  const up = (1 - enter) * 1000;
  // arms: shoulder -> elbow -> hand, blending between a resting and a raised pose
  const arm = (k: number, g: number) => {
    const sx = k * 182, sy = -385;
    const rest = { ex: k * 222, ey: -215, hx: k * 205, hy: -40 };
    const raise = mood === "thinking" && k < 0
      ? { ex: k * 175, ey: -250, hx: k * 72, hy: -505 } // hand to chin
      : mood === "shocked"
        ? { ex: k * 285, ey: -450, hx: k * 205, hy: -650 } // hands up by the face
        : { ex: k * 300, ey: -300, hx: k * 290, hy: -505 }; // open-hand gesture
    const p = (a: number, b: number) => a + (b - a) * g;
    return { sx, sy, ex: p(rest.ex, raise.ex), ey: p(rest.ey, raise.ey), hx: p(rest.hx, raise.hx), hy: p(rest.hy, raise.hy), g };
  };
  const arms = [
    arm(-1, mood === "thinking" || mood === "shocked" ? 1 : gesture * 0.3),
    arm(1, mood === "shocked" ? 1 : gesture),
  ];
  return (
    <g transform={`translate(${x},${y + up}) scale(${s}) rotate(${sway})`}>
      {/* legs + shoes (only seen in the tall Short frame) */}
      <Mirror>
        <path d="M 8 -20 L 175 -20 L 168 330 L 30 330 Z" fill={JEANS} />
        <path d="M 22 322 L 180 322 Q 205 322 205 352 Q 205 372 180 372 L 22 372 Z" fill={SHOE} />
      </Mirror>
      {/* neck */}
      <path d="M -44 -520 L -44 -432 Q 0 -404 44 -432 L 44 -520 Z" fill={SKIN_SHADE} />
      {/* yellow tee under an open blue shirt */}
      <g transform={`scale(1,${1 + breathe / 500})`} style={{ transformOrigin: "0 0" }}>
        <Mirror>
          <path d="M 0 -440 L 58 -440 Q 176 -436 206 -372 Q 224 -330 222 -250 L 214 10 L 0 10 Z" fill={TEE} />
          <path d="M 120 -380 Q 160 -200 150 10 L 214 10 L 222 -250 Q 220 -340 190 -390 Z" fill={TEE_SHADE} opacity={0.6} />
          {/* open shirt panel and collar */}
          <path d="M 62 -438 Q 176 -436 206 -372 Q 224 -330 222 -250 L 214 10 L 104 10 Q 92 -220 62 -438 Z" fill={SHIRT} />
          <path d="M 170 -300 Q 190 -150 186 10 L 214 10 L 222 -250 Q 222 -300 210 -340 Z" fill={SHIRT_SHADE} />
          <path d="M 58 -446 L 126 -420 L 94 -330 Z" fill={SHIRT_SHADE} />
        </Mirror>
        <path d="M -58 -440 Q 0 -398 58 -440 Q 0 -420 -58 -440 Z" fill={TEE_SHADE} />
      </g>
      {/* head, nodding slightly while talking */}
      <g transform={`translate(0,${nod}) rotate(${mood === "thinking" ? -4 : 0} 0 -470)`}>
        <Head mood={mood} mouth={mouth} blink={blink} look={arms[1].g > 0.5 ? 1 : 0.2} frame={frame} />
      </g>
      {/* arms: blue sleeve to the elbow, then forearm and a round hand */}
      {arms.map((a, i) => (
        <g key={i}>
          <path d={`M ${a.sx} ${a.sy} L ${a.ex} ${a.ey}`} stroke={i === 0 ? SHIRT_SHADE : SHIRT} strokeWidth={80} strokeLinecap="round" />
          <path d={`M ${a.ex} ${a.ey} L ${a.hx} ${a.hy}`} stroke={SKIN} strokeWidth={58} strokeLinecap="round" />
          <circle cx={a.hx} cy={a.hy} r={40} fill={SKIN} />
          <ellipse cx={a.hx + (i === 0 ? 30 : -30)} cy={a.hy - 18} rx={15} ry={22} fill={SKIN} transform={`rotate(${i === 0 ? 30 : -30} ${a.hx} ${a.hy})`} />
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
      background: "#fff", color: "#2d2a3a", borderRadius: 40, padding: "28px 36px",
      fontFamily: T.font, fontWeight: 700, fontSize: size, lineHeight: 1.2, boxShadow: "0 14px 0 rgba(45,42,58,0.18)",
    }}>
      <span>{shown}</span><span style={{ opacity: 0 }}>{text.slice(shown.length)}</span>
      <svg width={70} height={60} style={{ position: "absolute", bottom: -50, [tailLeft ? "left" : "right"]: 60 }}>
        <path d={tailLeft ? "M 0 0 L 20 52 L 60 0 Z" : "M 70 0 L 50 52 L 10 0 Z"} fill="#fff" />
      </svg>
    </div>
  );
};

// Soft, slowly drifting colour shapes behind the host.
const BLOBS = [
  { x: 0.12, y: 0.25, r: 0.09, c: "#ffd166" }, { x: 0.86, y: 0.18, r: 0.07, c: "#ff8fab" },
  { x: 0.78, y: 0.82, r: 0.11, c: "#80ed99" }, { x: 0.2, y: 0.8, r: 0.06, c: "#9bf6ff" },
  { x: 0.5, y: 0.1, r: 0.05, c: "#ffadad" },
];

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
  // Older scripts may carry a second speaker's line; the host says both.
  const speech = [scene.speech, scene.reply].filter(Boolean).join(" ");
  const zoom = interpolate(frame, [0, scene.durationInFrames], [1, 1.04]);
  const hx = W * (v ? 0.5 : 0.68);
  const hy = v ? H * 0.8 : H * 1.04;
  const s = v ? 1.0 : 1.18;
  const unit = Math.min(W, H);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #7ec8f7 0%, #a99cf0 100%)", overflow: "hidden" }}>
      <svg width={W} height={H} style={{ position: "absolute", transform: `scale(${zoom})`, transformOrigin: `${hx}px ${hy}px` }}>
        {BLOBS.map((b, i) => (
          <circle key={i} cx={b.x * W + Math.sin(frame / 50 + i) * 14} cy={b.y * H + Math.cos(frame / 60 + i * 2) * 12} r={b.r * unit} fill={b.c} opacity={0.55} />
        ))}
        <circle cx={hx} cy={hy - 600 * s} r={unit * 0.42} fill="#fff" opacity={0.18} />
        {v && <ellipse cx={hx} cy={hy + 372 * s} rx={260} ry={34} fill="#2d2a3a" opacity={0.18} />}
        <Host mood={mood} x={hx} y={hy} s={s} frame={frame} mouth={level} enter={enter} gesture={beat} />
      </svg>
      {speech && <Bubble text={speech} x={v ? 60 : W * 0.06} y={v ? 330 : H * 0.2} w={v ? W - 120 : W * 0.42} start={10} tailLeft={!v} size={v ? 54 : 46} />}
      {scene.label && !speech && (
        <div style={{
          position: "absolute", left: v ? 0 : W * 0.06, right: v ? 0 : undefined, top: v ? 340 : H * 0.3, width: v ? W : W * 0.36,
          textAlign: v ? "center" : "left", fontFamily: T.display, fontSize: v ? 96 : 104, color: "#fff", lineHeight: 1,
          opacity: interpolate(frame, [8, 20], [0, 1], clamp), textShadow: "0 6px 0 rgba(45,42,58,0.25)",
        }}>{scene.label}</div>
      )}
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};
