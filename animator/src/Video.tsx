import React from "react";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import { Captions, Enter, Watermark } from "./common";
import { MapScene } from "./scenes/MapScene";
import { CompareScene, ImageScene, StatScene, TimelineScene, TitleScene } from "./scenes/OtherScenes";
import type { Scene, VideoProps } from "./types";

const SCENES: Record<Scene["type"], React.FC<{ scene: Scene }>> = {
  title: TitleScene,
  map: MapScene,
  stat: StatScene,
  timeline: TimelineScene,
  compare: CompareScene,
  image: ImageScene,
};

export const Video: React.FC<VideoProps> = ({ scenes, channel, thumbnail }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Series>
      {scenes.map((s, i) => {
        const Comp = SCENES[s.type] ?? TitleScene;
        return (
          <Series.Sequence key={i} durationInFrames={s.durationInFrames}>
            <Enter>
              <Comp scene={s} />
            </Enter>
            {!thumbnail && <Watermark channel={channel} />}
            {!thumbnail && <Captions text={s.narration} duration={s.durationInFrames} />}
            {s.audio && <Audio src={staticFile(s.audio)} />}
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);
