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

type ImageGeometry = Region & { crop?: unknown; scale?: unknown };
export function relativeImageRegion(region: Region, element: Region): Region {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  if (element.width <= 0 || element.height <= 0)
    throw new Error("The image has invalid dimensions.");
  const x = clamp((region.x - element.x) / element.width);
  const y = clamp((region.y - element.y) / element.height);
  return {
    x,
    y,
    width: Math.max(
      0,
      clamp((region.x + region.width - element.x) / element.width) - x,
    ),
    height: Math.max(
      0,
      clamp((region.y + region.height - element.y) / element.height) - y,
    ),
  };
}
export async function cropImage(
  file: Scene["files"][string],
  region: Region,
  element: ImageGeometry,
) {
  const image = new Image();
  image.src = file.dataURL;
  await image.decode();
  const relative = relativeImageRegion(region, element);
  if (!relative.width || !relative.height)
    throw new Error("Draw the region inside the selected screenshot.");
  const crop = element.crop as
    | (Region & { naturalWidth: number; naturalHeight: number })
    | null
    | undefined;
  const source =
    crop && crop.naturalWidth > 0 && crop.naturalHeight > 0
      ? {
          x: (crop.x * image.width) / crop.naturalWidth,
          y: (crop.y * image.height) / crop.naturalHeight,
          width: (crop.width * image.width) / crop.naturalWidth,
          height: (crop.height * image.height) / crop.naturalHeight,
        }
      : { x: 0, y: 0, width: image.width, height: image.height };
  const scale = Array.isArray(element.scale) ? element.scale : [1, 1];
  const horizontal = scale[0] < 0,
    vertical = scale[1] < 0;
  const x = horizontal ? 1 - relative.x - relative.width : relative.x;
  const y = vertical ? 1 - relative.y - relative.height : relative.y;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(relative.width * source.width));
  canvas.height = Math.max(1, Math.round(relative.height * source.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is unavailable.");
  ctx.translate(horizontal ? canvas.width : 0, vertical ? canvas.height : 0);
  ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
  ctx.drawImage(
    image,
    source.x + x * source.width,
    source.y + y * source.height,
    relative.width * source.width,
    relative.height * source.height,
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
