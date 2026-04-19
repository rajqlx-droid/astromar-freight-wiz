import { Composition } from "remotion";
import { LoadingGuide, TOTAL_FRAMES } from "./LoadingGuide";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={LoadingGuide}
    durationInFrames={TOTAL_FRAMES}
    fps={30}
    width={1920}
    height={1080}
  />
);
