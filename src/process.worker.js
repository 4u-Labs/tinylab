self.onmessage = async ({ data }) => {
  try {
    const modules = {
      image: () => import("./engines/image.js"),
      text: () => import("./engines/text.js"),
      dev: () => import("./engines/dev.js"),
      data: () => import("./engines/data.js"),
      pdf: () => import("./engines/pdf.js"),
    };
    const engine = await modules[data.category]();
    const results = await engine.run(data.id, data.files, data.options, {
      progress: (value, message) =>
        self.postMessage({ event: "progress", value, message }),
    });
    self.postMessage({ event: "done", results });
  } catch (e) {
    self.postMessage({ event: "error", error: e.message });
  }
};
