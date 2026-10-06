export type LonLat = [number, number];

export type Scene = {
  type: "title" | "map" | "stat" | "timeline" | "compare" | "image";
  narration: string;
  durationInFrames: number;
  audio?: string;
  // title
  heading?: string;
  subheading?: string;
  icon?: string;
  // map
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
};

export type VideoProps = { title: string; channel: string; scenes: Scene[]; thumbnail?: boolean };
