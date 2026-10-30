import {
  progress,
  output,
  textOutput,
  baseName,
  check,
  asset,
} from "../utils.js";
export async function createOCR(language = "por+eng", ctx = {}) {
  const tesseract = await import("tesseract.js");
  const { createWorker } = tesseract.default || tesseract;
  const worker = await createWorker(language, 1, {
    workerPath: asset("ocr/worker.min.js"),
    corePath: asset("ocr/"),
    langPath: asset("ocr/"),
    logger: (m) => {
      if (m.status === "recognizing text")
        progress(ctx, Math.round(m.progress * 95));
    },
  });
  ctx.signal?.addEventListener("abort", () => worker.terminate(), {
    once: true,
  });
  return worker;
}
export async function run(id, files, o, ctx = {}) {
  const worker = await createOCR(o.language, ctx);
  try {
    const out = [];
    for (const file of files) {
      check(ctx);
      const { data } = await worker.recognize(file);
      out.push(textOutput(data.text, `${baseName(file.name)}-ocr.txt`));
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
