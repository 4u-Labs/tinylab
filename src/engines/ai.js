import { output, textOutput, baseName, progress } from "../utils.js";
let sharedWorker, idleTimer;
export async function run(id, files, o, ctx = {}) {
  if (id === "ocr-image")
    return (await import("./ocr.js")).run(id, files, o, ctx);
  if (id === "summarize-pdf") {
    const { extractText } = await import("./pdf.js");
    o = { ...o, content: (await extractText(files[0], ctx)).join("\n\n") };
  }
  let audio;
  if (id === "transcribe") {
    const ac = new AudioContext({ sampleRate: 16000 });
    try {
      let b;
      try {
        b = await ac.decodeAudioData(await files[0].arrayBuffer());
      } catch {
        const { run } = await import("./media.js");
        const extracted = await run(
          "extract-audio",
          files,
          { format: "wav" },
          ctx,
        );
        b = await ac.decodeAudioData(await extracted[0].blob.arrayBuffer());
      }
      if (b.duration > 1800)
        throw new Error(
          "Limite de 30 minutos por transcrição local / Local transcription limit is 30 minutes.",
        );
      const offline = new OfflineAudioContext(
          1,
          Math.ceil(b.duration * 16000),
          16000,
        ),
        source = offline.createBufferSource();
      source.buffer = b;
      source.connect(offline.destination);
      source.start();
      audio = (await offline.startRendering()).getChannelData(0).slice();
      if (audio.length > 16000 * 1800)
        throw new Error(
          "Limite de 30 minutos por transcrição local / Local transcription limit is 30 minutes.",
        );
    } finally {
      await ac.close();
    }
  }
  clearTimeout(idleTimer);
  const worker = (sharedWorker ??= new Worker(
    new URL("../assets/ai.worker.js", import.meta.url),
    { type: "module" },
  ));
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(fn, value) {
      if (settled) return;
      settled = true;
      if (fn === reject) {
        worker.terminate();
        sharedWorker = null;
      } else
        idleTimer = setTimeout(() => {
          worker.terminate();
          if (sharedWorker === worker) sharedWorker = null;
        }, 90000);
      worker.onmessage = null;
      worker.onerror = null;
      ctx.signal?.removeEventListener("abort", abort);
      fn(value);
    }
    const abort = () =>
      finish(
        reject,
        new DOMException(
          "Operação cancelada / Operation cancelled",
          "AbortError",
        ),
      );
    ctx.signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (e) => finish(reject, new Error(e.message));
    let activeDevice = "";
    worker.onmessage = ({ data }) => {
      if (data.event === "device") {
        activeDevice = data.device ? ` (${data.device})` : "";
        ctx.progress?.(
          null,
          `Executando inferência local${activeDevice} / Running local inference${activeDevice}`,
        );
      }
      if (data.event === "progress") {
        const p = data.progress;
        if (p.status === "progress")
          progress(
            ctx,
            Math.min(90, Number(p.progress) || 0),
            `${p.file || "Modelo / Model"} · ${Math.round(p.progress || 0)}%`,
          );
        else if (p.status === "chunk")
          progress(ctx, (p.index / p.total) * 80, `${p.index}/${p.total}`);
        else
          ctx.progress?.(
            null,
            p.status === "ready"
              ? `Modelo pronto${activeDevice} / Model ready${activeDevice}`
              : "Carregando modelo local / Loading local model",
          );
      }
      if (data.event === "token") ctx.token?.(data.text);
      if (data.event === "error") finish(reject, new Error(data.error));
      if (data.event === "done") {
        const r = data.results;
        const outputs = r.blob
          ? [
              output(
                r.blob,
                `${baseName(files[0]?.name || "tinylab")}-${id}.png`,
              ),
            ]
          : [
              textOutput(
                r.text,
                `${baseName(files[0]?.name || "tinylab")}-${id}.txt`,
              ),
            ];
        if (r.srt)
          outputs.push(
            textOutput(
              r.srt,
              `${baseName(files[0]?.name || "tinylab")}.srt`,
              "application/x-subrip",
            ),
          );
        finish(resolve, outputs);
      }
    };
    worker.postMessage(
      { id, options: o, blob: files[0], audio },
      audio ? [audio.buffer] : [],
    );
  });
}
