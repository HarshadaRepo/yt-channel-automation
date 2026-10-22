import React from "react";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import { Enter, Texture } from "./common";
import { setLook } from "./theme";
import { MapScene } from "./scenes/MapScene";
import { CompareScene, ImageScene, StatScene, TimelineScene, TitleScene } from "./scenes/OtherScenes";
import { Globe3DScene, Model3DScene, Sky3DScene, Terrain3DScene } from "./scenes/Scenes3D";
import { CharacterScene } from "./scenes/CharacterScene";
import { DocumentScene, ListScene, StoryScene, VersusScene } from "./scenes/StoryScenes";
import type { Scene, VideoProps } from "./types";

const SCENES: Record<Scene["type"], React.FC<{ scene: Scene }>> = {
  title: TitleScene,
  map: MapScene,
  stat: StatScene,
  timeline: TimelineScene,
  compare: CompareScene,
  image: ImageScene,
  model3d: Model3DScene,
  globe3d: Globe3DScene,
  terrain3d: Terrain3DScene,
  sky3d: Sky3DScene,
  story: StoryScene,
  document: DocumentScene,
  versus: VersusScene,
  list: ListScene,
  character: CharacterScene,
  illustration: ImageScene,
};

export const Video: React.FC<VideoProps> = ({ scenes, channel, thumbnail, style }) => {
  setLook(style);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        {scenes.map((s, i) => {
          const Comp = SCENES[s.type] ?? TitleScene;
          return (
            <Series.Sequence key={i} durationInFrames={s.durationInFrames}>
              <Enter index={i} still={!!thumbnail} duration={s.durationInFrames}>
                <Comp scene={s} />
              </Enter>
              {!thumbnail && <Texture />}
              {s.audio && <Audio src={staticFile(s.audio)} />}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
