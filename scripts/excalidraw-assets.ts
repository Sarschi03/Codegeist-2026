import { createReadStream } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

const directory = join(
  dirname(fileURLToPath(import.meta.resolve("@excalidraw/excalidraw"))),
  "fonts",
);

export function excalidrawAssets(): Plugin {
  return {
    name: "trace-excalidraw-assets",
    configureServer(server) {
      server.middlewares.use(
        "/excalidraw-assets/fonts",
        (request, response, next) => {
          const file = request.url
            ?.split("?")[0]
            .match(/^\/([a-zA-Z]+)\/([a-zA-Z0-9._-]+\.woff2)$/);
          if (!file) {
            next();
            return;
          }
          const stream = createReadStream(join(directory, file[1], file[2]));
          stream.on("error", () => next());
          stream.on("open", () => {
            response.setHeader("Content-Type", "font/woff2");
            stream.pipe(response);
          });
        },
      );
    },
    async writeBundle(options) {
      if (!options.dir) return;
      const destination = join(options.dir, "excalidraw-assets");
      await mkdir(destination, { recursive: true });
      await cp(directory, join(destination, "fonts"), { recursive: true });
    },
  };
}
