import { limits, type Scene } from "../shared/model";
export type Region = { x: number; y: number; width: number; height: number };
export async function compressImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Use a PNG, JPEG or WebP image.");
  if (file.size > limits.uploadBytes)
    throw new Error("Choose an image smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL("image/webp", 0.88);
      if (
        dataURL.startsWith("data:image/webp;") &&
        dataURL.length < limits.assetBytes - 500
      )
        return { dataURL, width: canvas.width, height: canvas.height };
      scale *= 0.75;
    }
    throw new Error("The compressed image exceeds the workspace limit.");
  } finally {
    bitmap.close();
  }
}
export async function cropImage(
  file: Scene["files"][string],
  region: Region,
  element: Region,
) {
  const image = new Image();
  image.src = file.dataURL;
  await image.decode();
  const left = Math.max(0, (region.x - element.x) / element.width);
  const top = Math.max(0, (region.y - element.y) / element.height);
  const right = Math.min(
    1,
    (region.x + region.width - element.x) / element.width,
  );
  const bottom = Math.min(
    1,
    (region.y + region.height - element.y) / element.height,
  );
  if (right <= left || bottom <= top)
    throw new Error("Draw the region inside the selected screenshot.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((right - left) * image.width));
  canvas.height = Math.max(1, Math.round((bottom - top) * image.height));
  canvas
    .getContext("2d")
    ?.drawImage(
      image,
      left * image.width,
      top * image.height,
      (right - left) * image.width,
      (bottom - top) * image.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Unable to crop image.")),
      "image/png",
    ),
  );
}
export async function readImage(
  image: Blob,
  progress: (value: number) => void,
) {
  const [
    { createWorker },
    { default: workerPath },
    { default: corePath },
    { default: langPath },
  ] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-lstm.wasm.js?url"),
    import("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url"),
  ]);
  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath: new URL(".", new URL(langPath, location.href)).href,
    cacheMethod: "none",
    logger: (event) => {
      if (event.status === "recognizing text") progress(event.progress);
    },
    workerBlobURL: false,
  } as Parameters<typeof createWorker>[2]);
  try {
    return (await worker.recognize(image)).data.text.trim().slice(0, 4000);
  } finally {
    await worker.terminate();
  }
}
