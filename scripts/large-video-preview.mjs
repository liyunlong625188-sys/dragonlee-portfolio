import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { singleRange } from "../worker/index.js";

const staticAssetLimit = 25 * 1024 * 1024;

function within(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

export function createLargeVideoPreviewMiddleware({ publicDirectory, outputDirectory }) {
  const sourceRoot = path.resolve(publicDirectory);
  const buildRoot = path.resolve(outputDirectory);

  return async (request, response, next) => {
    if (!["GET", "HEAD"].includes(request.method)) return next();
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      return next();
    }
    if (pathname.includes("\0") || path.extname(pathname).toLowerCase() !== ".mp4") return next();
    const relative = pathname.replace(/^\/+/, "");
    const source = path.resolve(sourceRoot, relative);
    const built = path.resolve(buildRoot, relative);
    if (!within(sourceRoot, source) || !within(buildRoot, built)) return next();

    let file;
    let size;
    try {
      const realRoot = await realpath(sourceRoot);
      file = await realpath(source);
      if (!within(realRoot, file)) return next();
      const info = await stat(file);
      if (!info.isFile() || info.size <= staticAssetLimit) return next();
      size = info.size;
      try {
        await stat(built);
        return next();
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return next();
      return next(error);
    }
    if (response.destroyed || request.aborted) return;

    // Preview always reads the current source video, including edits made after a build.
    // No local cache validator is emitted, so an If-Range request receives the full file.
    const range = request.method === "GET" && !request.headers["if-range"]
      ? singleRange(request.headers.range, size)
      : null;
    const headers = {
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    };
    if (range?.unsatisfiable) {
      response.writeHead(416, { ...headers, "content-range": "bytes */" + size, "content-length": "0" });
      response.end();
      return;
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    headers["content-length"] = String(end - start + 1);
    if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(file, { start, end });
    const cancel = () => stream.destroy();
    response.once("close", cancel);
    stream.once("close", () => response.removeListener("close", cancel));
    stream.once("error", (error) => response.destroy(error));
    stream.pipe(response);
  };
}

export function largeVideoPreviewPlugin() {
  return {
    name: "large-video-preview",
    configurePreviewServer(server) {
      server.middlewares.use(createLargeVideoPreviewMiddleware({
        publicDirectory: server.config.publicDir,
        outputDirectory: path.resolve(server.config.root, server.config.build.outDir),
      }));
    },
  };
}
