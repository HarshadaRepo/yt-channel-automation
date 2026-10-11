export type LonLat = [number, number];

export type Model3D =
  | "pyramid" | "stepPyramid" | "obelisk" | "temple" | "colosseum" | "castle" | "wall" | "ship"
  | "volcano" | "island" | "city" | "stonehenge" | "lighthouse" | "skyscraper" | "statue" | "bridge";

export type Scene = {
  type:
    | "title" | "map" | "stat" | "timeline" | "compare" | "image"
    | "model3d" | "globe3d" | "terrain3d" | "sky3d" | "story" | "document" | "versus" | "list" | "character";
  narration: string;
  durationInFrames: number;
  audio?: string;
  // title
  heading?: string;
  subheading?: string;
  icon?: string;
  // map / globe3d
  projection?: "globe" | "flat";
  center?: LonLat;
  zoomFrom?: number;
  zoomTo?: number;
  rotateFrom?: LonLat;
  highlight?: string[];
  markers?: { lonlat: LonLat; label: string; icon?: string }[];
  routes?: { from: LonLat; to: LonLat; icon?: string; label?: string }[];
  rings?: { center: LonLat; maxRadius: number; count?: number; label?: string };
  caption?: string;
  // stat
  value?: number;
  prefix?: string;
  suffix?: string;
  label?: string;
  // timeline
  events?: { year: string; label: string; icon?: string }[];
  // compare
  items?: { label: string; value: number; icon?: string }[];
  unit?: string;
  // image
  src?: string;
  // model3d / terrain3d / sky3d / story
  model?: Model3D;
  camera?: "orbit" | "dolly" | "flyover" | "rise" | "push";
  time?: "day" | "sunset" | "night" | "dawn" | "storm";
  effect?: "none" | "smoke" | "embers" | "rain" | "snow" | "dust" | "fog" | "stars";
  terrain?: "mountains" | "desert" | "islands" | "canyon" | "glacier" | "river" | "plains";
  annotations?: { text: string; side?: "left" | "right" }[];
  // sky3d
  constellation?: "big_dipper" | "orion" | "southern_cross" | "pole";
  // story
  setting?: "desert" | "sea" | "forest" | "city" | "mountains" | "village" | "battlefield" | "ice" | "coast";
  figures?: "none" | "traveler" | "crowd" | "soldiers" | "sailors" | "workers" | "royalty" | "explorers";
  props?: ("ship" | "campfire" | "tents" | "cart" | "camel" | "horse" | "tower" | "pyramid" | "palms" | "ruins" | "flag" | "torch")[];
  // document
  quote?: string;
  author?: string;
  // versus
  left?: { label: string; icon?: string; points?: string[] };
  right?: { label: string; icon?: string; points?: string[] };
  // character: cartoon people who talk with the narration
  role?: "king" | "queen" | "pharaoh" | "legionary" | "explorer" | "sailor" | "scientist" | "monk" | "viking"
    | "worker" | "samurai" | "merchant" | "emperor" | "pirate";
  expression?: "neutral" | "happy" | "shocked" | "angry" | "worried" | "thinking" | "smug";
  speech?: string;
  role2?: Scene["role"];
  expression2?: Scene["expression"];
  reply?: string;
  /** Narration loudness per frame (0-1), filled in by run.py; drives the mouth. */
  mouth?: number[];
  // list
  index?: number;
  total?: number;
};

export type VideoProps = {
  title: string;
  channel: string;
  scenes: Scene[];
  thumbnail?: boolean;
  vertical?: boolean;
  /** Name of a look in theme.LOOKS. */
  style?: string;
};
