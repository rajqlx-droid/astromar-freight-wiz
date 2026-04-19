import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("[render] bundling…");
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (config) => config,
});
console.log("[render] bundle ready:", bundled);

console.log("[render] launching browser…");
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({
  serveUrl: bundled,
  id: "main",
  puppeteerInstance: browser,
});
console.log("[render] composition:", composition.id, composition.durationInFrames, "frames");

const out = "/mnt/documents/loading-guide.mp4";
console.log("[render] rendering →", out);
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: out,
  puppeteerInstance: browser,
  muted: true,
  concurrency: 1,
  onProgress: ({ progress }) => {
    if (progress === 0 || progress === 1 || Math.round(progress * 20) % 2 === 0) {
      process.stdout.write(`  ${(progress * 100).toFixed(0)}%\n`);
    }
  },
});

await browser.close({ silent: false });
console.log("[render] done →", out);
