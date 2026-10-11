import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/800.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/800.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/900.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";
import "@fontsource/special-elite/400.css";
import "@fontsource/caveat/600.css";

export type Look = {
  ocean: string;
  oceanLight: string;
  land: string;
  landDim: string;
  border: string;
  accent: string;
  accent2: string;
  ink: string;
  paper: string;
  white: string;
  font: string;
  display: string;
  hand: string;
  emoji: string;
  /** Overlay texture drawn over every scene. */
  texture: "none" | "grain" | "paper" | "scanlines";
  /** How scenes cut in. */
  transition: "zoom" | "slide" | "iris" | "flash" | "blur";
  /** Sky/ambient colours used by the 3D scenes. */
  sky: [string, string];
  fog: string;
};

const base = {
  white: "#ffffff",
  font: "Poppins, sans-serif",
  hand: "Caveat, cursive",
  emoji: "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
};

/** Each video picks one look so the channel doesn't feel like the same video every day. */
export const LOOKS: Record<string, Look> = {
  // The original channel look: an old atlas at night.
  atlas: { ...base, ocean: "#0f1e2e", oceanLight: "#16304a", land: "#e9dcc0", landDim: "#c9b994", border: "#8c7a57",
    accent: "#ff6b3d", accent2: "#ffc94d", ink: "#1b1b1f", paper: "#f6efe0", display: "'Bebas Neue', Poppins, sans-serif",
    texture: "grain", transition: "zoom", sky: ["#0b1a2c", "#2b4a6b"], fog: "#16304a" },
  // Egypt, Rome, Greece, Maya: sandstone and gold.
  ancient: { ...base, ocean: "#2a1d12", oceanLight: "#5a3d22", land: "#f1d9a6", landDim: "#cfae6e", border: "#8a6a3a",
    accent: "#c8412b", accent2: "#f5c242", ink: "#24180e", paper: "#f3e3c1", display: "Cinzel, serif",
    texture: "paper", transition: "iris", sky: ["#f4b15c", "#7a4a2a"], fog: "#c99a62" },
  // Unsolved cases, disappearances, lost colonies.
  mystery: { ...base, ocean: "#0b1414", oceanLight: "#16302c", land: "#cfd8c9", landDim: "#93a493", border: "#5d7466",
    accent: "#d94848", accent2: "#9be0c4", ink: "#0b0f0f", paper: "#e8e2d0", display: "'Special Elite', monospace",
    texture: "grain", transition: "blur", sky: ["#0d1a1c", "#30504a"], fog: "#1e3532" },
  // Seas, ships, explorers, islands.
  ocean: { ...base, ocean: "#04202f", oceanLight: "#0a4a63", land: "#e6efe8", landDim: "#a9c4bd", border: "#5f8f93",
    accent: "#ff7a45", accent2: "#5ce1e6", ink: "#071820", paper: "#eef4f1", display: "Oswald, sans-serif",
    texture: "none", transition: "slide", sky: ["#5aa7c8", "#0a3954"], fog: "#2f7c99" },
  // Kings, empires, wars.
  empire: { ...base, ocean: "#1d0b10", oceanLight: "#43131f", land: "#efdcc2", landDim: "#c9a77f", border: "#8f6a45",
    accent: "#c9a227", accent2: "#ffd87a", ink: "#1a0d0d", paper: "#f2e6d2", display: "'Playfair Display', serif",
    texture: "paper", transition: "flash", sky: ["#a64b2a", "#2a0d14"], fog: "#5a2230" },
  // Modern world: cities, borders, tech, megaprojects.
  modern: { ...base, ocean: "#0a0f1f", oceanLight: "#151f3d", land: "#d9e2f2", landDim: "#8a9bbf", border: "#4d5f8a",
    accent: "#ff3d81", accent2: "#3df0ff", ink: "#05070f", paper: "#eef2fa", display: "Oswald, sans-serif",
    texture: "scanlines", transition: "slide", sky: ["#141c3a", "#3a2b6b"], fog: "#1b2550" },
  // Ice, poles, mountains.
  arctic: { ...base, ocean: "#0d2236", oceanLight: "#24506e", land: "#f4f8fb", landDim: "#bcd0de", border: "#7d9bb2",
    accent: "#ff5a36", accent2: "#9fe8ff", ink: "#0a1724", paper: "#f4f8fb", display: "Oswald, sans-serif",
    texture: "grain", transition: "blur", sky: ["#c7e3f5", "#4b7ea3"], fog: "#9fc3dc" },
  // Volcanoes, disasters, catastrophes.
  inferno: { ...base, ocean: "#140806", oceanLight: "#3a120a", land: "#e8d2bf", landDim: "#b08a6c", border: "#7a4a33",
    accent: "#ff4d1a", accent2: "#ffb03b", ink: "#100504", paper: "#f0e0d0", display: "'Bebas Neue', Poppins, sans-serif",
    texture: "grain", transition: "flash", sky: ["#ff7a2e", "#2a0a06"], fog: "#5a1d0e" },
};

/** The active look. Mutated once per render by <Video> (setLook) so every scene reads the same values. */
export const T: Look = { ...LOOKS.atlas };

export const setLook = (name?: string) => {
  Object.assign(T, LOOKS[name ?? "atlas"] ?? LOOKS.atlas);
};
