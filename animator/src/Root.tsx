import { Composition } from "remotion";
import { Video } from "./Video";
import type { VideoProps } from "./types";

const demo: VideoProps = {
  title: "Demo",
  channel: "Atlas of Odd Facts",
  scenes: [
    { type: "title", narration: "The loudest sound in history.", durationInFrames: 120, heading: "The Loudest Sound in History", icon: "🌋" },
    { type: "map", narration: "Krakatoa, 1883.", durationInFrames: 180, projection: "globe", center: [105.4, -6.1], zoomFrom: 1, zoomTo: 2.2,
      highlight: ["Indonesia"], markers: [{ lonlat: [105.4, -6.1], label: "Krakatoa", icon: "🌋" }],
      rings: { center: [105.4, -6.1], maxRadius: 60, count: 3 } },
  ],
};

export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={Video}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={300}
    defaultProps={demo}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, props.scenes.reduce((a, s) => a + s.durationInFrames, 0)),
      // Shorts are vertical 1080x1920; everything else lays itself out from useVideoConfig().
      ...(props.vertical ? { width: 1080, height: 1920 } : {}),
    })}
  />
);
