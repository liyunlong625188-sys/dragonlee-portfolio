// Replaced in the build copy; injecting an index also keeps the source worker testable.
export const mediaIndex = /* SITES_MEDIA_INDEX */ {};

export function singleRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header?.trim() ?? "");
  // Unsupported units, malformed syntax, and multiple ranges use the complete response.
  if (!match || (!match[1] && !match[2])) return null;
  const total = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n || total === 0n) return { unsatisfiable: true };
    return { start: Number(suffix >= total ? 0n : total - suffix), end: size - 1 };
  }

  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : total - 1n;
  if (start >= total || end < start) return { unsatisfiable: true };
  return { start: Number(start), end: Number(end >= total ? total - 1n : end) };
}

function chunkStream(request, env, media, start, end) {
  const chunks = [];
  let offset = 0;
  for (const chunk of media.chunks) {
    const last = offset + chunk.size - 1;
    if (start <= last && end >= offset) {
      chunks.push({
        ...chunk,
        skip: Math.max(0, start - offset),
        length: Math.min(end, last) - Math.max(start, offset) + 1,
      });
    }
    offset += chunk.size;
  }

  let nextChunk = 0;
  let reader;
  let skip = 0;
  let remaining = 0;
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (!reader) {
            if (nextChunk === chunks.length) {
              controller.close();
              return;
            }
            const chunk = chunks[nextChunk++];
            const url = new URL(request.url);
            url.pathname = chunk.path;
            url.search = "";
            // Never inherit the video's Range, conditionals, or HEAD method for a chunk.
            const response = await env.ASSETS.fetch(new Request(url, {
              method: "GET",
              headers: { "accept-encoding": "identity" },
            }));
            if (cancelled) {
              await response.body?.cancel();
              return;
            }
            const declaredSize = response.headers.get("content-length");
            if (
              response.status !== 200 || !response.body ||
              response.headers.get("content-type")?.includes("text/html") ||
              (declaredSize !== null && Number(declaredSize) !== chunk.size)
            ) {
              throw new Error("Missing video chunk: " + chunk.path);
            }
            reader = response.body.getReader();
            skip = chunk.skip;
            remaining = chunk.length;
          }

          const { done, value } = await reader.read();
          if (cancelled) return;
          if (done) throw new Error("Video chunk ended before its declared length");
          const leading = Math.min(skip, value.byteLength);
          skip -= leading;
          const length = Math.min(remaining, value.byteLength - leading);
          if (length === 0) continue;
          const bytes = value.subarray(leading, leading + length);
          remaining -= length;
          if (remaining === 0) {
            await reader.cancel();
            reader = undefined;
          }
          controller.enqueue(bytes);
          return;
        }
      } catch (error) {
        await reader?.cancel().catch(() => {});
        reader = undefined;
        if (!cancelled) controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader?.cancel(reason);
      reader = undefined;
    },
  }, { highWaterMark: 0 });
}

function mediaResponse(request, env, media) {
  const headers = new Headers({
    "content-type": media.contentType,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=0, must-revalidate",
    etag: media.etag,
  });
  const matches = request.headers.get("if-none-match")?.split(",").some((tag) => {
    const normalized = tag.trim().replace(/^W\//, "");
    return normalized === "*" || normalized === media.etag;
  });
  if (matches) return new Response(null, { status: 304, headers });

  // Range only applies to GET. A HEAD response describes the complete video.
  const ifRange = request.headers.get("if-range");
  const range = request.method === "GET" && (!ifRange || ifRange === media.etag)
    ? singleRange(request.headers.get("range"), media.size)
    : null;
  if (range?.unsatisfiable) {
    headers.set("content-range", "bytes */" + media.size);
    headers.set("content-length", "0");
    return new Response(null, { status: 416, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? media.size - 1;
  const length = end - start + 1;
  headers.set("content-length", String(length));
  if (range) headers.set("content-range", `bytes ${start}-${end}/${media.size}`);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  let body = chunkStream(request, env, media, start, end);
  // Workers derives Content-Length from FixedLengthStream; Node uses the standard stream.
  if (typeof globalThis.FixedLengthStream === "function") {
    const fixed = new globalThis.FixedLengthStream(length);
    body.pipeTo(fixed.writable).catch(() => {});
    body = fixed.readable;
  }
  return new Response(body, { status: range ? 206 : 200, headers });
}

export function createWorker(index = mediaIndex) {
  return {
    async fetch(request, env) {
      const pathname = new URL(request.url).pathname;
      if (["GET", "HEAD"].includes(request.method) && Object.hasOwn(index, pathname)) {
        return mediaResponse(request, env, index[pathname]);
      }

      const response = await env.ASSETS.fetch(request);
      const acceptsHtml = request.headers.get("accept")?.includes("text/html");

      if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
        return response;
      }

      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/index.html";
      indexUrl.search = "";
      return env.ASSETS.fetch(new Request(indexUrl, request));
    },
  };
}

export default createWorker();
