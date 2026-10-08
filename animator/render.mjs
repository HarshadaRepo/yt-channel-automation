// Render a video spec to MP4.
//   node render.mjs <job-dir>          (job-dir holds video.json + audio/*.wav [+ images/*])
//   node render.mjs <job-dir> --still 120   (one PNG frame, for quick checks)
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const job = path.resolve(process.argv[2] ?? ".");
const stillAt = process.argv.includes("--still") ? Number(process.argv[process.argv.indexOf("--still") + 1]) : null;
const inputProps = JSON.parse(fs.readFileSync(path.join(job, "video.json"), "utf8"));
if (stillAt !== null) inputProps.thumbnail = true; // stills are for thumbnails: no captions/watermark

// Use a locally installed Chrome if REMOTION_CHROME is set; otherwise Remotion downloads its own.
const browserExecutable = process.env.REMOTION_CHROME || null;

const serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts"), publicDir: job });
const composition = await selectComposition({ serveUrl, id: "Video", inputProps, browserExecutable });

if (stillAt !== null) {
  const out = path.join(job, `still_${stillAt}.png`);
  await renderStill({ composition, serveUrl, output: out, frame: stillAt, inputProps, browserExecutable });
  console.log(out);
} else {
  const out = path.join(job, "video.mp4");
  let last = -1;
  await renderMedia({
    composition, serveUrl, codec: "h264", crf: 20, outputLocation: out, inputProps, browserExecutable,
    concurrency: Math.max(1, os.cpus().length - 1),
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 20);
      if (p !== last) { last = p; process.stdout.write(`render ${Math.round(progress * 100)}%\n`); }
    },
  });
  console.log(out);
}
