import { output, baseName, progress, check } from "../utils.js";
const asset = (p) => new URL(`../vendor/${p}`, import.meta.url).href;
export function atempoChain(speed) {
  let s = Math.max(0.25, Math.min(8, Number(speed || 1)));
  const parts = [];
  while (s > 2) {
    parts.push("atempo=2");
    s /= 2;
  }
  while (s < 0.5) {
    parts.push("atempo=0.5");
    s /= 0.5;
  }
  parts.push(`atempo=${Number(s.toFixed(4))}`);
  return parts.join(",");
}
export function command(id, o, input, outputName, meta = {}) {
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
    case "crop-video": {
      const dims = {
        "9:16": [720, 1280],
        "1:1": [1080, 1080],
        "4:5": [1080, 1350],
        "16:9": [1280, 720],
      }[o.aspect || "9:16"] || [720, 1280];
      const [tw, th] = dims;
      if (o.mode === "pad") {
        return [
          "-i",
          input,
          "-filter_complex",
          `[0:v]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},boxblur=20:5[bg];[0:v]scale=${tw}:${th}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`,
          "-map",
          "[v]",
          "-map",
          "0:a?",
          ...enc,
          outputName,
        ];
      }
      return [
        "-i",
        input,
        "-vf",
        `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1`,
        ...enc,
        outputName,
      ];
    }
    case "speed-media": {
      const spd = Math.max(0.25, Math.min(8, Number(o.speed || 1.5)));
      const atempo = atempoChain(spd);
      if (meta.isAudioOnly || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(input)) {
        return ["-i", input, "-vn", "-af", atempo, ...audioCodec("mp3"), outputName];
      }
      if (meta.hasAudio === false) {
        return [
          "-i",
          input,
          "-vf",
          `setpts=PTS/${spd}`,
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          outputName,
        ];
      }
      return [
        "-i",
        input,
        "-filter_complex",
        `[0:v]setpts=PTS/${spd}[v];[0:a]${atempo}[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        ...enc,
        outputName,
      ];
    }
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
    case "reverse-video":
      if (o.audioMode === "mute" || meta.hasAudio === false) {
        return [
          "-i",
          input,
          "-vf",
          "reverse",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          outputName,
        ];
      }
      return [
        "-i",
        input,
        "-vf",
        "reverse",
        "-af",
        "areverse",
        ...enc,
        outputName,
      ];
    case "denoise-audio": {
      const af =
        o.mode === "karaoke"
          ? "pan=stereo|c0=c0-c1|c1=c1-c0"
          : o.mode === "podcast"
            ? "highpass=f=80,lowpass=f=13000,afftdn=nf=-24,acompressor=threshold=-18dB:ratio=3:attack=15:release=200,dynaudnorm"
            : "highpass=f=70,afftdn=nf=-25,dynaudnorm";
      return ["-i", input, "-vn", "-af", af, ...audioCodec(fmt), outputName];
    }
    case "add-audio-video": {
      const audioIn = meta.audioInput || "input-1.mp3";
      const vol = Math.max(0.1, Math.min(3, Number(o.musicVol || 80) / 100)).toFixed(2);
      const loopArgs = o.loop === "no" ? [] : ["-stream_loop", "-1"];
      if (o.mode === "mix" && meta.hasVideoAudio !== false) {
        return [
          "-i",
          input,
          ...loopArgs,
          "-i",
          audioIn,
          "-filter_complex",
          `[0:a]volume=1.0[va];[1:a]volume=${vol}[ma];[va][ma]amix=inputs=2:duration=first:dropout_transition=2[outa]`,
          "-map",
          "0:v:0",
          "-map",
          "[outa]",
          "-shortest",
          ...enc,
          outputName,
        ];
      }
      return [
        "-i",
        input,
        ...loopArgs,
        "-i",
        audioIn,
        "-filter_complex",
        `[1:a]volume=${vol}[outa]`,
        "-map",
        "0:v:0",
        "-map",
        "[outa]",
        "-shortest",
        ...enc,
        outputName,
      ];
    }
    default:
      throw new Error(
        "Operação de mídia desconhecida / Unknown media operation.",
      );
  }
}
export function synthesizeSpeechWav(
  text,
  voiceProfile = "warm",
  rate = 1,
) {
  const clean = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .slice(0, 4000);
  if (!clean)
    throw new Error("Digite o texto para narrar / Enter text to speak.");
  const sr = 22050;
  const spd = Math.max(0.5, Math.min(2.5, Number(rate || 1)));
  const baseF0 =
    voiceProfile === "female"
      ? 215
      : voiceProfile === "male"
        ? 118
        : voiceProfile === "robot"
          ? 142
          : 164;
  const formants = {
    a: [730, 1090, 2440],
    e: [530, 1840, 2480],
    i: [270, 2290, 3010],
    o: [570, 840, 2410],
    u: [300, 870, 2240],
    m: [280, 900, 2200],
    n: [300, 1450, 2450],
    l: [360, 1300, 2600],
    r: [420, 1380, 1900],
  };
  const tokens = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i].toLowerCase();
    if (/\s/.test(ch)) {
      if (tokens.at(-1)?.kind !== "pause")
        tokens.push({ kind: "pause", dur: 0.055 / spd });
    } else if (/[,;:]/.test(ch)) {
      tokens.push({ kind: "pause", dur: 0.16 / spd });
    } else if (/[.!?]/.test(ch)) {
      tokens.push({ kind: "pause", dur: 0.26 / spd });
    } else if (formants[ch]) {
      tokens.push({
        kind: "voiced",
        f: formants[ch],
        dur: (/[aeiou]/.test(ch) ? 0.095 : 0.065) / spd,
        amp: /[aeiou]/.test(ch) ? 0.85 : 0.52,
      });
    } else if (/[szfxjcv]/.test(ch)) {
      tokens.push({ kind: "fric", dur: 0.055 / spd, freq: /[sz]/.test(ch) ? 4200 : 2400 });
    } else if (/[ptkbdg]/.test(ch)) {
      tokens.push({ kind: "plosive", dur: 0.045 / spd, voiced: /[bdg]/.test(ch) });
    } else {
      tokens.push({
        kind: "voiced",
        f: [480, 1500, 2400],
        dur: 0.055 / spd,
        amp: 0.48,
      });
    }
  }
  const totalSamples = Math.max(
    Math.round(sr * 0.25),
    tokens.reduce((acc, t) => acc + Math.round(t.dur * sr), 0) + Math.round(sr * 0.12),
  );
  const pcm = new Float32Array(totalSamples);
  let cursor = Math.round(sr * 0.04);
  let phase0 = 0,
    phase1 = 0,
    phase2 = 0,
    phase3 = 0,
    rng = 1337;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0xffffffff - 0.5;
  };
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];
    const len = Math.max(1, Math.round(tok.dur * sr));
    const progressRatio = ti / Math.max(1, tokens.length - 1);
    const contour =
      voiceProfile === "robot"
        ? 1
        : 1 + 0.06 * Math.sin(progressRatio * Math.PI * 3) - 0.08 * progressRatio;
    const f0 = baseF0 * contour;
    for (let n = 0; n < len && cursor + n < totalSamples; n++) {
      const u = n / len;
      const env = Math.sin(Math.min(1, u / 0.15) * (Math.PI / 2)) *
        Math.sin(Math.min(1, (1 - u) / 0.22) * (Math.PI / 2));
      let sample = 0;
      if (tok.kind === "voiced") {
        phase0 += (2 * Math.PI * f0) / sr;
        phase1 += (2 * Math.PI * tok.f[0]) / sr;
        phase2 += (2 * Math.PI * tok.f[1]) / sr;
        phase3 += (2 * Math.PI * tok.f[2]) / sr;
        const glottal =
          Math.sin(phase0) +
          0.5 * Math.sin(2 * phase0) +
          0.25 * Math.sin(3 * phase0);
        sample =
          tok.amp *
          env *
          (0.45 * glottal +
            0.32 * Math.sin(phase1) +
            0.16 * Math.sin(phase2) +
            0.07 * Math.sin(phase3));
      } else if (tok.kind === "fric") {
        phase1 += (2 * Math.PI * tok.freq) / sr;
        sample = 0.26 * env * rand() * Math.sin(phase1);
      } else if (tok.kind === "plosive") {
        if (u > 0.35) {
          phase0 += (2 * Math.PI * f0) / sr;
          sample =
            env *
            (0.28 * rand() * Math.exp(-(u - 0.35) * 14) +
              (tok.voiced ? 0.25 * Math.sin(phase0) : 0));
        }
      }
      pcm[cursor + n] = Math.max(-0.98, Math.min(0.98, sample));
    }
    cursor += len;
  }
  const wavBuf = new ArrayBuffer(44 + totalSamples * 2);
  const dv = new DataView(wavBuf);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, "data");
  dv.setUint32(40, totalSamples * 2, true);
  for (let i = 0; i < totalSamples; i++) {
    dv.setInt16(44 + i * 2, Math.round(pcm[i] * 32767), true);
  }
  return new Uint8Array(wavBuf);
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
  if (id === "text-to-speech") {
    const wavBytes = synthesizeSpeechWav(o.content, o.voiceProfile, o.rate);
    progress(ctx, 100);
    return [
      output(
        new Blob([wavBytes], { type: "audio/wav" }),
        "tinylab-tts.wav",
      ),
    ];
  }
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
    const isAudioInput =
      id === "speed-media" &&
      files[0] &&
      (files[0].type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(files[0].name));
    const audio =
      [
        "extract-audio",
        "convert-audio",
        "trim-audio",
        "merge-audio",
        "normalize-audio",
        "denoise-audio",
      ].includes(id) || isAudioInput;
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
    let res = [];
    async function exec(a) {
      const code = await ff.exec(["-nostdin", "-y", ...a], 300000);
      check(ctx);
      if (code !== 0) throw new Error("FFmpeg: " + logs.slice(-5).join("\n"));
    }
    async function probeInput(inName) {
      const probeLogs = [];
      const handler = ({ message }) => probeLogs.push(message);
      ff.on("log", handler);
      try {
        await ff.exec(["-nostdin", "-i", inName], 20000);
      } catch {}
      ff.off?.("log", handler);
      const joined = probeLogs.join("\n");
      const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(joined);
      const hasVideo = /Stream #\d+:\d+.*Video:/i.test(joined);
      const durMatch = joined.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const duration = durMatch
        ? Number(durMatch[1]) * 3600 +
          Number(durMatch[2]) * 60 +
          Number(durMatch[3])
        : 3;
      return { hasAudio, hasVideo, duration: Math.max(0.1, duration) };
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
    } else if (id === "merge-video") {
      if (files.length < 2)
        throw new Error(
          "Selecione ao menos dois vídeos / Select at least two video files.",
        );
      const [tw, th] =
        o.resolution === "1080"
          ? [1920, 1080]
          : o.resolution === "vertical"
            ? [720, 1280]
            : [1280, 720];
      const infos = [];
      for (const n of inputs) infos.push(await probeInput(n));
      const anyAudio = infos.some((inf) => inf.hasAudio);
      const vChains = inputs.map(
        (_, i) =>
          `[${i}:v]scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,setsar=1[v${i}]`,
      );
      if (anyAudio) {
        const aChains = inputs.map((_, i) =>
          infos[i].hasAudio
            ? `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
            : `anullsrc=r=44100:cl=stereo:d=${infos[i].duration.toFixed(2)}[a${i}]`,
        );
        const pairs = inputs.map((_, i) => `[v${i}][a${i}]`).join("");
        const fc = `${[...vChains, ...aChains].join(";")};${pairs}concat=n=${inputs.length}:v=1:a=1[outv][outa]`;
        await exec([
          ...inputs.flatMap((n) => ["-i", n]),
          "-filter_complex",
          fc,
          "-map",
          "[outv]",
          "-map",
          "[outa]",
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
          "output.mp4",
        ]);
      } else {
        const vInputs = inputs.map((_, i) => `[v${i}]`).join("");
        const fc = `${vChains.join(";")};${vInputs}concat=n=${inputs.length}:v=1:a=0[outv]`;
        await exec([
          ...inputs.flatMap((n) => ["-i", n]),
          "-filter_complex",
          fc,
          "-map",
          "[outv]",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          "output.mp4",
        ]);
      }
      res.push(
        output(
          new Blob([await ff.readFile("output.mp4")], { type: "video/mp4" }),
          "tinylab-videos.mp4",
        ),
      );
    } else if (id === "subtitles-video" || id === "burn-subtitles") {
      const subtitles = String(o.subtitles || "");
      if (!/\d\d:\d\d:\d\d[,\.]\d{3}\s*-->/.test(subtitles))
        throw new Error("Legendas SRT inválidas / Invalid SRT subtitles.");
      await ff.writeFile("captions.srt", new TextEncoder().encode(subtitles));
      if (id === "burn-subtitles") {
        const fontResp = await fetch(asset("DejaVuSans.ttf"));
        if (!fontResp.ok)
          throw new Error("Fonte indisponível / Subtitle font unavailable.");
        try {
          await ff.createDir("/fonts");
        } catch {}
        await ff.writeFile(
          "/fonts/DejaVuSans.ttf",
          new Uint8Array(await fontResp.arrayBuffer()),
        );
        const fSize = Math.max(10, Math.min(48, Number(o.fontSize || 20)));
        const marginV = Math.max(4, Math.min(180, Number(o.marginV || 28)));
        await exec([
          "-i",
          inputs[0],
          "-vf",
          `subtitles=captions.srt:fontsdir=/fonts:force_style='FontName=DejaVu Sans,Fontsize=${fSize},MarginV=${marginV},Outline=2,Shadow=1'`,
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
          "output.mp4",
        ]);
      } else {
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
      }
      res.push(
        output(
          new Blob([await ff.readFile("output.mp4")], { type: "video/mp4" }),
          `${baseName(files[0].name)}-legendado.mp4`,
        ),
      );
    } else if (id === "add-audio-video") {
      if (files.length < 2)
        throw new Error(
          "Selecione 1 arquivo de vídeo e 1 arquivo de áudio / Select 1 video file and 1 audio file.",
        );
      let vIdx = files.findIndex(
        (f) =>
          f.type.startsWith("video/") ||
          /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name),
      );
      let aIdx = files.findIndex(
        (f, idx) =>
          idx !== vIdx &&
          (f.type.startsWith("audio/") ||
            /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name)),
      );
      if (vIdx < 0) vIdx = 0;
      if (aIdx < 0) aIdx = vIdx === 0 ? 1 : 0;
      const vInfo = await probeInput(inputs[vIdx]);
      await exec(
        command("add-audio-video", o, inputs[vIdx], "output.mp4", {
          audioInput: inputs[aIdx],
          hasVideoAudio: vInfo.hasAudio,
        }),
      );
      res.push(
        output(
          new Blob([await ff.readFile("output.mp4")], { type: "video/mp4" }),
          `${baseName(files[vIdx].name)}-com-audio.mp4`,
        ),
      );
    } else
      for (let i = 0; i < inputs.length; i++) {
        const outName =
          id === "video-frames"
            ? `frame-${i}-%04d.png`
            : `output-${i}.${format}`;
        const meta =
          id === "speed-media" || id === "reverse-video"
            ? {
                ...(await probeInput(inputs[i])),
                isAudioOnly: isAudioInput,
              }
            : {};
        await exec(command(id, o, inputs[i], outName, meta));
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
