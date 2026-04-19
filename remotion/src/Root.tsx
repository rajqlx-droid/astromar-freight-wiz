import { Composition } from "remotion";
import { LoadingGuide, totalFrames, type LoadingGuideProps } from "./LoadingGuide";
import { loadScenarioAsync } from "./scenario-loader";
import { buildDemoScenario } from "./scenario-demo";

const DEFAULT_SCENARIO = buildDemoScenario();

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={LoadingGuide}
    durationInFrames={totalFrames(DEFAULT_SCENARIO.rows.length)}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ scenario: DEFAULT_SCENARIO } as LoadingGuideProps}
    calculateMetadata={async ({ defaultProps }) => {
      const scenario = await loadScenarioAsync();
      return {
        durationInFrames: totalFrames(scenario.rows.length),
        props: { ...defaultProps, scenario },
      };
    }}
  />
);
