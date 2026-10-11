import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";
import { Chip, clamp } from "../common";
import type { Scene } from "../types";

// Big expressive cartoon characters in the style of popular animated history channels: they
// slide in, blink, gesture, and their mouth follows the narration (scene.mouth, one value per frame).

type Role = NonNullable<Scene["role"]>;
type Mood = NonNullable<Scene["expression"]>;

const OUT = "#1d1a22";
const SKIN = ["#f2c7a5", "#e0a982", "#c68863", "#9a6447", "#6e4630"];

const COSTUME: Record<Role, { body: string; trim: string }> = {
  king: { body: "#7a1f2b", trim: "#e8b84a" },
  queen: { body: "#5b2a86", trim: "#e8b84a" },
  pharaoh: { body: "#f1e6c8", trim: "#2f6db5" },
  legionary: { body: "#a8322d", trim: "#c9a24a" },
  explorer: { body: "#b99b6b", trim: "#5d4a2e" },
  sailor: { body: "#20476e", trim: "#f2f2f2" },
  scientist: { body: "#f4f6f8", trim: "#3b82c4" },
  monk: { body: "#6b4a2f", trim: "#3d2a1a" },
  viking: { body: "#5d6b4a", trim: "#8a5a32" },
  worker: { body: "#d9822b", trim: "#3d5a80" },
  samurai: { body: "#2c3e63", trim: "#b8323a" },
  merchant: { body: "#2f7d6d", trim: "#f0c75e" },
  emperor: { body: "#c9a227", trim: "#7a1f2b" },
  pirate: { body: "#3a2a2a", trim: "#b8323a" },
};

const BROWS: Record<Mood, [number, number]> = {
  // [inner-end lift, outer-end lift] in units; positive = up
  neutral: [0, 0], happy: [6, 2], shocked: [22, 14], angry: [-18, 8], worried: [18, -6], thinking: [10, -4], smug: [-6, 10],
};

const Headwear: React.FC<{ role: Role; frame: number }> = ({ role, frame }) => {
  const c = COSTUME[role];
  const s = { stroke: OUT, strokeWidth: 8, strokeLinejoin: "round" as const };
  switch (role) {
    case "king": case "queen": case "emperor":
      return <g {...s}>
        {role === "queen" && <path d="M -160 -660 Q -190 -420 -140 -380 L -110 -560 Z M 160 -660 Q 190 -420 140 -380 L 110 -560 Z" fill="#5a3b22" />}
        {role === "emperor"
          ? <path d="M -150 -700 Q -40 -760 0 -745 Q 40 -760 150 -700 Q 90 -730 0 -722 Q -90 -730 -150 -700 Z" fill="#4f8a3a" />
          : <path d="M -115 -730 L -125 -830 L -65 -775 L 0 -850 L 65 -775 L 125 -830 L 115 -730 Z" fill={c.trim} />}
        {role !== "emperor" && [-70, 0, 70].map((x) => <circle key={x} cx={x} cy={-748} r={11} fill="#c8323a" strokeWidth={4} />)}
      </g>;
    case "pharaoh":
      return <g {...s}>
        <path d="M -150 -700 Q 0 -820 150 -700 L 185 -470 L 120 -470 L 135 -640 Q 0 -700 -135 -640 L -120 -470 L -185 -470 Z" fill="#e9c75a" />
        {[-1, 1].map((k) => [0, 1, 2, 3].map((i) => <line key={`${k}${i}`} x1={k * (140 + i * 10)} y1={-640 + i * 45} x2={k * (175 + i * 3)} y2={-625 + i * 45} stroke="#2f6db5" strokeWidth={12} />))}
        <path d="M -20 -735 Q 0 -790 20 -735 Z" fill="#e9c75a" />
      </g>;
    case "legionary":
      return <g {...s}>
        <path d="M -155 -640 Q -150 -800 0 -805 Q 150 -800 155 -640 L 120 -640 Q 110 -740 0 -745 Q -110 -740 -120 -640 Z" fill="#b9b9c2" />
        <path d="M -20 -800 Q 0 -900 120 -880 Q 70 -850 20 -800 Z" fill="#c8323a" />
        <path d="M -150 -640 L -160 -540 L -120 -560 Z M 150 -640 L 160 -540 L 120 -560 Z" fill="#b9b9c2" />
      </g>;
    case "explorer":
      return <g {...s}>
        <ellipse cx={0} cy={-715} rx={210} ry={34} fill="#d9c08f" />
        <path d="M -135 -715 Q -130 -830 0 -835 Q 130 -830 135 -715 Z" fill="#e3cd9d" />
        <rect x={-135} y={-740} width={270} height={22} fill={c.trim} strokeWidth={6} />
      </g>;
    case "sailor": case "pirate":
      return role === "pirate"
        ? <g {...s}><path d="M -210 -700 Q -120 -760 0 -850 Q 120 -760 210 -700 Q 0 -740 -210 -700 Z" fill="#2a2222" /><circle cx={0} cy={-760} r={18} fill="#f2f2f2" strokeWidth={4} /></g>
        : <g {...s}><ellipse cx={0} cy={-735} rx={140} ry={40} fill="#f2f2f2" /><rect x={-125} y={-745} width={250} height={26} fill={c.body} strokeWidth={5} /></g>;
    case "scientist":
      return <g {...s}>
        {[...Array(9)].map((_, i) => {
          const a = Math.PI * (0.05 + i * 0.1125);
          const w = Math.sin(frame / 7 + i) * 6;
          return <path key={i} d={`M ${-Math.cos(a) * 140} ${-640 - Math.sin(a) * 130} q ${-Math.cos(a) * 50 + w} ${-Math.sin(a) * 60} ${-Math.cos(a) * 90} ${-Math.sin(a) * 50}`}
            stroke="#e6e6e6" strokeWidth={34} strokeLinecap="round" fill="none" />;
        })}
      </g>;
    case "monk":
      return <path d="M -175 -560 Q -200 -820 0 -830 Q 200 -820 175 -560 L 135 -560 Q 150 -760 0 -770 Q -150 -760 -135 -560 Z" fill={c.body} {...s} />;
    case "viking":
      return <g {...s}>
        <path d="M -150 -650 Q -150 -810 0 -815 Q 150 -810 150 -650 Z" fill="#8f949c" />
        <rect x={-14} y={-660} width={28} height={90} fill="#8f949c" strokeWidth={6} />
        <rect x={-150} y={-672} width={300} height={28} fill="#6c7078" strokeWidth={6} />
      </g>;
    case "worker":
      return <g {...s}><path d="M -165 -690 Q -150 -830 0 -835 Q 150 -830 165 -690 Z" fill="#f2c230" /><rect x={-190} y={-700} width={380} height={24} rx={12} fill="#f2c230" /></g>;
    case "samurai":
      return <g {...s}>
        <path d="M -175 -640 Q -160 -800 0 -805 Q 160 -800 175 -640 L 200 -600 L 130 -630 L -130 -630 L -200 -600 Z" fill="#2c2c34" />
        <path d="M -90 -790 Q -150 -900 -110 -930 Q -60 -860 0 -800 Q 60 -860 110 -930 Q 150 -900 90 -790 Z" fill="#d6a63a" />
      </g>;
    case "merchant":
      return <g {...s}><path d="M -150 -680 Q -170 -820 0 -830 Q 170 -820 150 -680 Q 0 -720 -150 -680 Z" fill="#f2efe4" /><circle cx={0} cy={-730} r={16} fill={c.trim} strokeWidth={4} /></g>;
  }
};

const Face: React.FC<{ mood: Mood; mouth: number; blink: number; look: number; role: Role; skin: string }> = ({ mood, mouth, blink, look, role, skin }) => {
  const [inner, outer] = BROWS[mood];
  const big = mood === "shocked" ? 1.25 : 1;
  const beard = role === "viking" || role === "pirate" || role === "monk" || role === "merchant";
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
      {beard && <path d="M -140 -600 Q -150 -430 0 -400 Q 150 -430 140 -600 Q 100 -520 0 -515 Q -100 -520 -140 -600 Z"
        fill={role === "monk" ? "#bdb6ad" : role === "merchant" ? "#2b2622" : "#b0582a"} strokeWidth={8} />}
      {/* mouth: opens with the narration, shaped by mood */}
      <path d={`M ${-w} -545 Q 0 ${-545 + curve} ${w} -545 Q 0 ${-545 + curve + open} ${-w} -545 Z`}
        fill="#5a1f24" strokeWidth={7} />
      {open > 22 && <path d={`M ${-w * 0.5} ${-545 + curve * 0.5 + open * 0.75} Q 0 ${-545 + curve * 0.5 + open * 0.45} ${w * 0.5} ${-545 + curve * 0.5 + open * 0.75}`}
        fill="#e06a73" stroke="none" />}
      {mood === "worried" && <path d="M 150 -700 q 14 30 0 44 q -14 -14 0 -44 Z" fill="#9fd8ff" strokeWidth={4} />}
      {(mood === "happy" || mood === "smug") && [-1, 1].map((k) => <ellipse key={k} cx={k * 100} cy={-575} rx={26} ry={14} fill="#ff8a8a" opacity={0.45} stroke="none" />)}
      {skin && null}
    </g>
  );
};

const Hand: React.FC<{ role: Role; side: number }> = ({ role, side }) => {
  // What the raised hand holds, drawn at the hand.
  const s = { stroke: OUT, strokeWidth: 7 };
  if (side < 0) return null;
  switch (role) {
    case "king": case "queen": case "emperor":
      return <g {...s}><rect x={-10} y={-260} width={20} height={300} fill="#e8b84a" /><circle cx={0} cy={-270} r={28} fill="#c8323a" /></g>;
    case "pharaoh":
      return <g {...s}><path d="M -8 -200 L -8 30 L 8 30 L 8 -200 Q 8 -250 -40 -250" fill="none" stroke="#2f6db5" strokeWidth={16} /></g>;
    case "legionary": case "viking":
      return <g {...s}><rect x={-8} y={-360} width={16} height={420} fill="#7a5a32" /><path d="M -22 -360 L 0 -430 L 22 -360 Z" fill="#c9cbd2" /></g>;
    case "explorer": case "sailor": case "pirate":
      return <g {...s} transform="rotate(-30)"><rect x={-18} y={-200} width={36} height={170} rx={6} fill="#a36b2c" /><rect x={-24} y={-220} width={48} height={40} rx={6} fill="#d9a441" /></g>;
    case "scientist":
      return <g {...s}><path d="M -16 -150 L -16 -90 L -50 -20 Q -55 0 -35 0 L 35 0 Q 55 0 50 -20 L 16 -90 L 16 -150 Z" fill="#9be0c4" /></g>;
    case "monk": case "merchant":
      return <g {...s}><rect x={-60} y={-90} width={120} height={70} rx={14} fill="#efe1bd" /><line x1={-40} y1={-65} x2={40} y2={-65} /><line x1={-40} y1={-45} x2={30} y2={-45} /></g>;
    case "samurai":
      return <g {...s} transform="rotate(-20)"><rect x={-7} y={-380} width={14} height={340} fill="#dfe3ea" /><rect x={-26} y={-40} width={52} height={14} fill="#d6a63a" /></g>;
    default:
      return null;
  }
};

const Character: React.FC<{
  role: Role; mood: Mood; x: number; s: number; flip: boolean; frame: number; mouth: number; enter: number; seed: number; H: number; gesture: number;
}> = ({ role, mood, x, s, flip, frame, mouth, enter, seed, H, gesture }) => {
  const c = COSTUME[role] ?? COSTUME.explorer;
  const skin = SKIN[Math.floor(random(`skin${role}${seed}`) * SKIN.length)];
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
      {/* torso */}
      <path d={`M -250 900 L -250 40 Q -250 -330 -175 -${420 + breathe} Q 0 -${470 + breathe} 175 -${420 + breathe} Q 250 -330 250 40 L 250 900 Z`} fill={c.body} stroke={OUT} strokeWidth={9} />
      <path d={`M -70 -${445 + breathe} L 0 -330 L 70 -${445 + breathe}`} fill="none" stroke={c.trim} strokeWidth={22} strokeLinejoin="round" />
      {role === "legionary" && [-120, -60, 0, 60, 120].map((x) => <rect key={x} x={x - 26} y={-250} width={52} height={240} fill="#c9cbd2" stroke={OUT} strokeWidth={5} />)}
      {role === "scientist" && <><rect x={-35} y={-330} width={70} height={360} fill="#3b82c4" stroke={OUT} strokeWidth={5} /><rect x={110} y={-250} width={70} height={60} fill="none" stroke={OUT} strokeWidth={5} /></>}
      {(role === "king" || role === "queen" || role === "emperor") && <path d="M -250 -180 Q 0 -120 250 -180 L 250 -140 Q 0 -80 -250 -140 Z" fill="#f4efe6" stroke={OUT} strokeWidth={5} />}
      {role === "pharaoh" && <path d="M -175 -410 Q 0 -260 175 -410 L 165 -360 Q 0 -220 -165 -360 Z" fill="#e9c75a" stroke={OUT} strokeWidth={6} />}
      {/* neck + head */}
      <rect x={-45} y={-500} width={90} height={80} fill={skin} stroke={OUT} strokeWidth={8} />
      <ellipse cx={0} cy={-620} rx={150} ry={165} fill={skin} stroke={OUT} strokeWidth={9} />
      {[-1, 1].map((k) => <ellipse key={k} cx={k * 150} cy={-615} rx={22} ry={34} fill={skin} stroke={OUT} strokeWidth={7} />)}
      <Face mood={mood} mouth={mouth} blink={blink} look={flip ? -0.6 : 0.6} role={role} skin={skin} />
      {role === "pirate" && <><path d="M -140 -690 L 120 -600" stroke={OUT} strokeWidth={6} /><ellipse cx={-58} cy={-640} rx={40} ry={36} fill={OUT} /></>}
      {role === "scientist" && [-1, 1].map((k) => <circle key={k} cx={k * 58} cy={-640} r={46} fill="none" stroke={OUT} strokeWidth={7} />)}
      <Headwear role={role} frame={frame} />
      {/* arms on top so gestures read clearly */}
      {arms.map((a, i) => (
        <g key={i}>
          <path d={`M ${a.sx} ${a.sy} L ${a.ex} ${a.ey} L ${a.hx} ${a.hy}`} fill="none" stroke={OUT} strokeWidth={84} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${a.sx} ${a.sy} L ${a.ex} ${a.ey} L ${a.hx} ${a.hy}`} fill="none" stroke={c.body} strokeWidth={68} strokeLinecap="round" strokeLinejoin="round" />
          <g transform={`translate(${a.hx},${a.hy})`}>
            <Hand role={role} side={i === 1 ? 1 : -1} />
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
  const role = (scene.role ?? "explorer") as Role;
  const mood = (scene.expression ?? "neutral") as Mood;
  const two = !!scene.role2;
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
          <Character role={role} mood={mood} x={W * (v ? 0.3 : 0.27)} s={s} flip={false} frame={frame} mouth={speaking2 ? 0 : level} enter={enter1} seed={1} H={H} gesture={speaking2 ? 0 : beat(frame)} />
          <Character role={scene.role2 as Role} mood={(scene.expression2 ?? "neutral") as Mood} x={W * (v ? 0.7 : 0.73)} s={s} flip frame={frame}
            mouth={speaking2 ? level : 0} enter={enter2} seed={2} H={H} gesture={speaking2 ? beat(frame - replyAt) : 0} />
        </> : <Character role={role} mood={mood} x={W * (v ? 0.5 : 0.62)} s={s} flip={false} frame={frame} mouth={level} enter={enter1} seed={1} H={H} gesture={beat(frame)} />}
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
