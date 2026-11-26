import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { excalidrawAssets } from "./scripts/excalidraw-assets.ts";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import {
  limits,
  validateWorkspace,
  type Workspace,
  type WorkspaceSummary,
} from "./src/shared/model.ts";
const refs = {
  list: makeFunctionReference<"query", { secret: string }, WorkspaceSummary[]>(
    "trace:list",
  ),
  get: makeFunctionReference<
    "query",
    { secret: string; id: string },
    Workspace | null
  >("trace:get"),
  save: makeFunctionReference<
    "mutation",
    { secret: string; payload: string; expected: number | null },
    WorkspaceSummary
  >("trace:save"),
  remove: makeFunctionReference<
    "mutation",
    { secret: string; id: string; expected: number },
    null
  >("trace:remove"),
};
function relay(url: string, secret: string): Plugin {
  const client = new ConvexHttpClient(url, { logger: false });
  return {
    name: "trace-convex-relay",
    configureServer(server) {
      server.middlewares.use("/__trace_convex", async (req, res) => {
        const send = (status: number, data: object) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(data));
        };
        const host = req.headers.host ?? "";
        if (
          req.method !== "POST" ||
          !/^localhost:\d+$|^127\.0\.0\.1:\d+$/.test(host) ||
          req.headers.origin !== "http://" + host ||
          req.headers["x-trace-client"] !== "1" ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? "",
          )
        )
          return send(403, {
            error:
              "The Convex relay is available from the local Trace app only.",
          });
        try {
          let size = 0;
          const parts: Buffer[] = [];
          for await (const part of req) {
            const chunk: Buffer = part;
            size += chunk.length;
            if (size > limits.workspaceBytes + limits.sceneBytes + 100_000) {
              send(413, { error: "Workspace exceeds the relay size limit." });
              return;
            }
            parts.push(chunk);
          }
          const { op, id, expected, workspace } = JSON.parse(
            Buffer.concat(parts).toString("utf8"),
          );
          if (op === "list")
            return send(200, {
              result: await client.query(refs.list, { secret }),
            });
          if (op === "get" && typeof id === "string")
            return send(200, {
              result: await client.query(refs.get, { secret, id }),
            });
          if (
            op === "save" &&
            (expected === null || Number.isInteger(expected))
          )
            return send(200, {
              result: await client.mutation(refs.save, {
                secret,
                payload: JSON.stringify(validateWorkspace(workspace)),
                expected,
              }),
            });
          if (
            op === "remove" &&
            typeof id === "string" &&
            Number.isInteger(expected)
          )
            return send(200, {
              result: await client.mutation(refs.remove, {
                secret,
                id,
                expected,
              }),
            });
          return send(400, { error: "Invalid workspace request." });
        } catch (error) {
          return send(502, {
            error:
              error instanceof ConvexError && typeof error.data === "string"
                ? error.data
                : "Could not save or retrieve the workspace from Convex. Check the connection and try again.",
          });
        }
      });
    },
  };
}
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const enabled = command === "serve" && env.VITE_TRACE_CONVEX === "true";
  const url = env.CONVEX_URL || env.VITE_CONVEX_URL;
  if (enabled && (!url || !env.TRACE_RELAY_SECRET))
    throw new Error(
      "Convex mode requires a deployment URL and TRACE_RELAY_SECRET.",
    );
  return {
    base: "./",
    plugins: [
      react(),
      excalidrawAssets(),
      ...(enabled ? [relay(url, env.TRACE_RELAY_SECRET)] : []),
    ],
    server: { host: "localhost" },
    build: {
      rollupOptions: {
        output: {
          assetFileNames: (asset) =>
            asset.names.includes("eng.traineddata.gz")
              ? "ocr/eng.traineddata.gz"
              : "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
