import { output, baseName, progress, check } from "../utils.js";
const asset = (p) => new URL(`../vendor/${p}`, import.meta.url).href;
export function command(id, o, input, outputName) {
  const start = Number(o.start || 0),
    duration = Number(o.duration || 10),
    width = Math.round(Number(o.width || 1280) / 2) * 2;
  const enc = [
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
  ];
  const fmt = o.format || "mp4";
  switch (id) {
    case "extract-audio":
    case "convert-audio":
      return ["-i", input, "-vn", ...audioCodec(fmt), outputName];
    case "trim-audio":
      return [
        "-ss",
        String(start),
        "-i",
        input,
        "-t",
        String(duration),
        "-vn",
        ...audioCodec(fmt),
        outputName,
      ];
    case "normalize-audio":
      return [
        "-i",
        input,
        "-vn",
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        ...audioCodec(fmt),
        outputName,
      ];
    case "video-to-gif":
      return [
        "-ss",
        String(start),
        "-i",
        input,
        "-t",
        String(duration),
        "-vf",
        `fps=${Number(o.fps || 12)},scale=${width}:-1:flags=lanczos`,
        outputName,
      ];
    case "video-frames":
      return [
        "-ss",
        String(start),
        "-i",
        input,
        "-t",
        String(duration),
        "-vf",
        `fps=${Number(o.fps || 1)}`,
        "-frames:v",
        "200",
        outputName,
      ];
    case "mute-video":
      return ["-i", input, "-an", "-c:v", "copy", outputName];
    case "trim-video":
      return [
        "-ss",
        String(start),
        "-i",
        input,
        "-t",
        String(duration),
        ...enc,
        outputName,
      ];
    case "resize-video":
      return ["-i", input, "-vf", `scale=${width}:-2`, ...enc, outputName];
    case "compress-video":
      return [
        "-i",
        input,
        "-vf",
        `scale=min(${width}\\,iw):-2`,
        ...enc,
        "-crf",
        String(o.crf || 28),
        outputName,
      ];
    case "gif-to-video":
      return [
        "-i",
        input,
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ...enc,
        outputName,
      ];
    case "convert-video":
      return [
        "-i",
        input,
        ...(fmt === "webm"
          ? [
              "-c:v",
              "libvpx",
              "-deadline",
              "realtime",
              "-cpu-used",
              "8",
              "-c:a",
              "libopus",
            ]
          : enc),
        outputName,
      ];
    default:
      throw new Error(
        "Operação de mídia desconhecida / Unknown media operation.",
      );
  }
}
const audioCodec = (fmt) =>
  fmt === "wav"
    ? ["-c:a", "pcm_s16le"]
    : fmt === "ogg"
      ? ["-c:a", "libvorbis", "-q:a", "4"]
      : fmt === "m4a"
        ? ["-c:a", "aac", "-b:a", "192k"]
        : ["-c:a", "libmp3lame", "-b:a", "192k"];
export async function run(id, files, o, ctx = {}) {
  const { FFmpeg } = await import(asset("ffmpeg/index.js"));
  const ff = new FFmpeg();
  const logs = [];
  ff.on("log", ({ message }) => {
    logs.push(message);
    if (logs.length > 12) logs.shift();
  });
  ff.on("progress", ({ progress: p }) =>
    progress(ctx, Math.min(95, Math.max(0, p * 95))),
  );
  ctx.signal?.addEventListener("abort", () => ff.terminate(), { once: true });
  try {
    progress(ctx, 0, "FFmpeg · ~32 MB");
    await ff.load({
      coreURL: asset("ffmpeg-core/ffmpeg-core.js"),
      wasmURL: asset("ffmpeg-core/ffmpeg-core.wasm"),
    });
    const inputs = [];
    for (let i = 0; i < files.length; i++) {
      check(ctx);
      const ext = (files[i].name.split(".").pop() || "bin")
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 8);
      const name = `input-${i}.${ext}`;
      await ff.writeFile(name, new Uint8Array(await files[i].arrayBuffer()));
      inputs.push(name);
    }
    const audio = [
      "extract-audio",
      "convert-audio",
      "trim-audio",
      "merge-audio",
      "normalize-audio",
    ].includes(id);
    const format =
      id === "video-to-gif"
        ? "gif"
        : id === "video-frames"
          ? "png"
          : audio
            ? o.format || "mp3"
            : id === "convert-video"
              ? o.format || "mp4"
              : "mp4";
    const mime = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      gif: "image/gif",
      png: "image/png",
    }[format];
    let args,
      res = [];
    async function exec(a) {
      const code = await ff.exec(["-nostdin", "-y", ...a], 300000);
      check(ctx);
      if (code !== 0) throw new Error("FFmpeg: " + logs.slice(-5).join("\n"));
    }
    if (id === "merge-audio") {
      if (files.length < 2)
        throw new Error(
          "Selecione ao menos dois áudios / Select at least two audio files.",
        );
      const filter =
        inputs
          .map(
            (_, i) =>
              `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
          )
          .join(";") +
        ";" +
        inputs.map((_, i) => `[a${i}]`).join("") +
        `concat=n=${inputs.length}:v=0:a=1[out]`;
      await exec([
        ...inputs.flatMap((n) => ["-i", n]),
        "-filter_complex",
        filter,
        "-map",
        "[out]",
        ...audioCodec(format),
        `output.${format}`,
      ]);
      res.push(
        output(
          new Blob([await ff.readFile(`output.${format}`)], { type: mime }),
          `tinylab-audios.${format}`,
        ),
      );
    } else if (id === "subtitles-video") {
      const subtitles = String(o.subtitles || "");
      if (!/\d\d:\d\d:\d\d[,\.]\d{3}\s*-->/.test(subtitles))
        throw new Error("Legendas SRT inválidas / Invalid SRT subtitles.");
      await ff.writeFile("captions.srt", new TextEncoder().encode(subtitles));
      await exec([
        "-i",
        inputs[0],
        "-i",
        "captions.srt",
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map",
        "1:0",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-c:s",
        "mov_text",
        "-metadata:s:s:0",
        "language=por",
        "output.mp4",
      ]);
      res.push(
        output(
          new Blob([await ff.readFile("output.mp4")], { type: "video/mp4" }),
          `${baseName(files[0].name)}-legendado.mp4`,
        ),
      );
    } else
      for (let i = 0; i < inputs.length; i++) {
        const outName =
          id === "video-frames"
            ? `frame-${i}-%04d.png`
            : `output-${i}.${format}`;
        await exec(command(id, o, inputs[i], outName));
        if (id === "video-frames") {
          for (const entry of await ff.listDir("/"))
            if (entry.name.startsWith(`frame-${i}-`))
              res.push(
                output(
                  new Blob([await ff.readFile(entry.name)], { type: mime }),
                  entry.name,
                ),
              );
        } else
          res.push(
            output(
              new Blob([await ff.readFile(outName)], { type: mime }),
              `${baseName(files[i].name)}-${id}.${format}`,
            ),
          );
      }
    progress(ctx, 100);
    return res;
  } finally {
    ff.terminate();
  }
}
