import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import Peep from "react-peeps";
import { T } from "../theme";
import { Chip, clamp } from "../common";
import type { Scene } from "../types";

// The channel's one talking host, the same in every video. Hats (2026-10-12) didn't like our
// hand-drawn hosts and asked to use a proper animated character instead, plain and neutral (no
// costumes, beards or robes, nothing that marks a religion, ethnicity or race). The host is built
// from Open Peeps (Pablo Stanley's hand-drawn character library, via the MIT-licensed react-peeps):
// a fixed haircut and black sweater, with the face and pose swapped to act.
// (react-peeps' pointing pose crops the hand at the drawing's edge, so it isn't used.)
// Lip-sync: the face switches between a closed- and an open-mouth version of the expression as
// the narration gets louder (scene.mouth, one value per frame).

type Mood = NonNullable<Scene["expression"]>;
type Face = React.ComponentProps<typeof Peep>["face"];
type Body = React.ComponentProps<typeof Peep>["body"];

const LINE = "#1d1a22";
const FILL = "#fdf3e6";
const HAIR = "ShortWavy";

// [mouth closed, mouth open] for each expression
const FACES: Record<Mood, [Face, Face]> = {
  neutral: ["Smile", "Explaining"],
  happy: ["Smile", "SmileTeeth"],
  shocked: ["Awe", "ConcernedFear"],
  worried: ["Concerned", "ConcernedFear"],
  angry: ["Serious", "Explaining"],
  thinking: ["Suspicious", "Explaining"],
  smug: ["Cheeky", "SmileTeeth"],
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
      fontFamily: T.font, fontWeight: 700, fontSize: size, lineHeight: 1.2, boxShadow: "0 12px 0 rgba(0,0,0,0.15)",
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

  // Face: open mouth on louder syllables; a short blink now and then while the mouth is closed.
  const talking = level > 0.35;
  const blink = !talking && frame % 96 < 4 && (mood === "neutral" || mood === "happy");
  const face: Face = blink ? "Calm" : FACES[mood][talking ? 1 : 0];
  // Pose: thinking and smug fold their arms; otherwise a relaxed stance.
  const body: Body = mood === "thinking" || mood === "smug" ? "CrossedArmsBW" : "RestingBW";

  // Small life: breathing, a nod on loud syllables, a gentle sway, and a shake when shocked.
  const breathe = Math.sin(frame / 20) * 0.006;
  const nod = level * 6;
  const sway = Math.sin(frame / 45) * 1.2 + (mood === "shocked" ? Math.sin(frame * 1.3) * 1.2 : 0);
  const ph = v ? H * 0.62 : H * 0.86;
  const pw = ph * (850 / 1200);
  const px = v ? (W - pw) / 2 : W * 0.66 - pw / 2;
  const py = H - ph + (1 - enter) * ph + nod;
  const speech = [scene.speech, scene.reply].filter(Boolean).join(" ");
  const zoom = interpolate(frame, [0, scene.durationInFrames], [1, 1.04]);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 60% 40%, #fbf3e3 0%, #f1e2c6 55%, #dcc49c 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${px + pw / 2}px ${H}px` }}>
        {/* faint dots and a warm glow behind the host */}
        <svg width={W} height={H} style={{ position: "absolute" }}>
          <defs>
            <radialGradient id="hostGlow"><stop offset="0%" stopColor="#ffd98a" stopOpacity={0.6} /><stop offset="100%" stopColor="#ffd98a" stopOpacity={0} /></radialGradient>
            <pattern id="hostDots" width={46} height={46} patternUnits="userSpaceOnUse"><circle cx={23} cy={23} r={3} fill="#b89a6a" opacity={0.22} /></pattern>
          </defs>
          <rect width={W} height={H} fill="url(#hostDots)" />
          <circle cx={px + pw / 2} cy={py + ph * 0.3} r={pw * 0.7} fill="url(#hostGlow)" />
        </svg>
        <div style={{
          position: "absolute", left: px, top: py, width: pw, height: ph,
          transform: `rotate(${sway}deg) scale(${1 + breathe}, ${1 - breathe})`, transformOrigin: "50% 100%",
        }}>
          <Peep style={{ width: pw, height: ph }} body={body} face={face} hair={HAIR} facialHair="None" accessory="None"
            strokeColor={LINE} backgroundColor={FILL} />
        </div>
      </AbsoluteFill>
      {speech && <Bubble text={speech} x={v ? 60 : W * 0.06} y={v ? 330 : H * 0.2} w={v ? W - 120 : W * 0.42} start={10} tailLeft={!v} size={v ? 54 : 46} />}
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
