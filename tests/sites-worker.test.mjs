import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, open, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import worker, { createWorker } from "../worker/index.js";
import { createLargeVideoPreviewMiddleware } from "../scripts/large-video-preview.mjs";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

const videoPath = "/assets/test-video.mp4";
const videoBytes = "abcdefghijkl";
const testIndex = {
  [videoPath]: {
    size: videoBytes.length,
    contentType: "video/mp4",
    etag: '"test-video"',
    chunks: [
      { path: "/.media-chunks/test/0.bin", size: 4 },
      { path: "/.media-chunks/test/1.bin", size: 4 },
      { path: "/.media-chunks/test/2.bin", size: 4 },
    ],
  },
};

function videoFixture() {
  const calls = [];
  const videos = createWorker(testIndex);
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        calls.push(path);
        assert.equal(request.method, "GET");
        assert.equal(new URL(request.url).search, "");
        assert.equal(request.headers.get("range"), null);
        assert.equal(request.headers.get("if-range"), null);
        assert.equal(request.headers.get("if-none-match"), null);
        const index = testIndex[videoPath].chunks.findIndex((chunk) => chunk.path === path);
        if (index < 0) return new Response("missing", { status: 404 });
        const bytes = new TextEncoder().encode(videoBytes.slice(index * 4, index * 4 + 4));
        // Split each stored chunk into network reads so offsets also cross read boundaries.
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 2));
            controller.enqueue(bytes.subarray(2));
            controller.close();
          },
        }));
      },
    },
  };
  return {
    calls,
    fetch: (options) => videos.fetch(new Request("https://example.test" + videoPath + "?v=1", options), env),
  };
}

test("streams the complete original video with playback and cache headers", async () => {
  const fixture = videoFixture();
  const response = await fixture.fetch();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), "12");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("etag"), '"test-video"');
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(response.headers.get("content-range"), null);
  assert.deepEqual(fixture.calls, [], "the response must not preload the video");
  assert.equal(await response.text(), videoBytes);
  assert.deepEqual(fixture.calls, testIndex[videoPath].chunks.map((chunk) => chunk.path));
});

test("serves single-byte, cross-chunk, open-ended, suffix and clamped ranges", async () => {
  for (const [range, expected, contentRange, chunkNumbers] of [
    ["bytes=0-0", "a", "bytes 0-0/12", [0]],
    ["bytes=11-11", "l", "bytes 11-11/12", [2]],
    ["bytes=3-8", "defghi", "bytes 3-8/12", [0, 1, 2]],
    ["bytes=4-7", "efgh", "bytes 4-7/12", [1]],
    ["bytes=11-", "l", "bytes 11-11/12", [2]],
    ["bytes=-5", "hijkl", "bytes 7-11/12", [1, 2]],
    ["bytes=-999", videoBytes, "bytes 0-11/12", [0, 1, 2]],
    ["bytes=10-999999999999999999999", "kl", "bytes 10-11/12", [2]],
  ]) {
    const fixture = videoFixture();
    const response = await fixture.fetch({ headers: { range } });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get("content-range"), contentRange, range);
    assert.equal(response.headers.get("content-length"), String(expected.length), range);
    assert.equal(await response.text(), expected, range);
    assert.deepEqual(fixture.calls, chunkNumbers.map((number) => testIndex[videoPath].chunks[number].path), range);
  }
});

test("rejects unsatisfiable ranges without fetching video chunks", async () => {
  for (const range of ["bytes=12-", "bytes=99-100", "bytes=999999999999999999999-", "bytes=8-7", "bytes=-0"]) {
    const fixture = videoFixture();
    const response = await fixture.fetch({ headers: { range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("content-range"), "bytes */12", range);
    assert.equal(response.headers.get("content-length"), "0", range);
    assert.equal(await response.text(), "", range);
    assert.deepEqual(fixture.calls, [], range);
  }
});

test("ignores unsupported, malformed and multiple ranges", async () => {
  for (const range of ["items=0-1", "bytes=invalid", "bytes=-", "bytes=0-1,4-5"]) {
    const fixture = videoFixture();
    const response = await fixture.fetch({ headers: { range } });
    assert.equal(response.status, 200, range);
    assert.equal(response.headers.get("content-range"), null, range);
    assert.equal(await response.text(), videoBytes, range);
  }
});

test("HEAD describes the entire video and ignores Range without fetching chunks", async () => {
  const fixture = videoFixture();
  const response = await fixture.fetch({ method: "HEAD", headers: { range: "bytes=3-8" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "12");
  assert.equal(response.headers.get("content-range"), null);
  assert.equal(response.body, null);
  assert.deepEqual(fixture.calls, []);
});

test("honors the video ETag for cache validation and If-Range", async () => {
  for (const method of ["GET", "HEAD"]) {
    const fixture = videoFixture();
    const response = await fixture.fetch({ method, headers: { "if-none-match": '"old", W/"test-video"' } });
    assert.equal(response.status, 304);
    assert.equal(response.headers.get("etag"), '"test-video"');
    assert.equal(response.body, null);
    assert.deepEqual(fixture.calls, []);
  }
  for (const [ifRange, status, expected] of [
    ['"test-video"', 206, "bcd"],
    ['"old-video"', 200, videoBytes],
    ['W/"test-video"', 200, videoBytes],
  ]) {
    const fixture = videoFixture();
    const response = await fixture.fetch({ headers: { range: "bytes=1-3", "if-range": ifRange } });
    assert.equal(response.status, status);
    assert.equal(await response.text(), expected);
  }
});

test("stops fetching later chunks when a video request is cancelled", async () => {
  const fixture = videoFixture();
  const response = await fixture.fetch();
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "ab");
  await reader.cancel("player seeked");
  assert.deepEqual(fixture.calls, [testIndex[videoPath].chunks[0].path]);
});

test("errors the video stream if a chunk is missing, an app fallback, or shorter than declared", async () => {
  for (const response of [
    new Response("missing", { status: 404 }),
    new Response("<html>app</html>", { headers: { "content-type": "text/html" } }),
    new Response("a"),
    new Response("abcd", { headers: { "content-length": "3" } }),
  ]) {
    const videos = createWorker(testIndex);
    const result = await videos.fetch(new Request("https://example.test" + videoPath), {
      ASSETS: { fetch: async () => response },
    });
    await assert.rejects(result.arrayBuffer(), /Missing video chunk|declared length/);
  }
});

test("uses a fixed-length stream when the Workers runtime provides it", async () => {
  const original = globalThis.FixedLengthStream;
  const lengths = [];
  globalThis.FixedLengthStream = class {
    constructor(length) {
      lengths.push(length);
      let written = 0;
      const stream = new TransformStream({
        transform(bytes, controller) {
          written += bytes.byteLength;
          controller.enqueue(bytes);
        },
        flush() { assert.equal(written, length); },
      });
      this.writable = stream.writable;
      this.readable = stream.readable;
    }
  };
  try {
    const fixture = videoFixture();
    const response = await fixture.fetch({ headers: { range: "bytes=3-8" } });
    assert.equal(await response.text(), "defghi");
    assert.deepEqual(lengths, [6]);
  } finally {
    if (original === undefined) delete globalThis.FixedLengthStream;
    else globalThis.FixedLengthStream = original;
  }
});

async function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    for await (const bytes of createReadStream(file)) hash.update(bytes);
  }
  return '"' + hash.digest("hex") + '"';
}

test("build chunks preserve every large MP4 byte and remain under the static upload limit", async () => {
  const { mediaIndex: builtIndex } = await import("../dist/server/index.js");
  for (const [url, video] of Object.entries(builtIndex)) {
    assert.ok(video.size > 25 * 1024 * 1024);
    await assert.rejects(access(new URL("../dist/client" + url, import.meta.url)), { code: "ENOENT" });
    const files = [];
    let total = 0;
    for (const chunk of video.chunks) {
      assert.ok(chunk.path.startsWith("/.media-chunks/"));
      const file = new URL("../dist/client" + chunk.path, import.meta.url);
      const size = (await stat(file)).size;
      assert.ok(size > 0 && size <= 8 * 1024 * 1024);
      assert.equal(size, chunk.size);
      files.push(file);
      total += size;
    }
    assert.equal(total, video.size);
    assert.equal(await hashFiles(files), video.etag);
    const original = new URL("../public" + url, import.meta.url);
    const originalExists = await access(original).then(() => true, error => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (originalExists) assert.equal(await hashFiles([original]), video.etag);
    else {
      const sourceManifest = JSON.parse(await readFile(new URL("../content/source-video-chunks.json", import.meta.url), "utf8"));
      const sourceVideo = sourceManifest.videos[url];
      assert.ok(sourceVideo, "Missing hosted source-video entry: " + url);
      assert.equal(sourceVideo.etag, video.etag);
      assert.equal(await hashFiles(sourceVideo.chunks.map(chunk => new URL("../public" + chunk.path, import.meta.url))), video.etag);
    }
  }

  async function checkDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = new URL(encodeURIComponent(entry.name) + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await checkDirectory(file);
      else assert.ok((await stat(file)).size <= 25 * 1024 * 1024, "Oversized static asset: " + file);
    }
  }
  await checkDirectory(new URL("../dist/client/", import.meta.url));
});

test("Vite preview serves removed large source videos and protects ordinary assets and paths", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "sites-video-preview-"));
  const publicDirectory = path.join(directory, "public");
  const outputDirectory = path.join(directory, "dist", "client");
  const assets = path.join(publicDirectory, "assets");
  await mkdir(assets, { recursive: true });
  await mkdir(path.join(outputDirectory, "assets"), { recursive: true });
  const size = 26 * 1024 * 1024;
  const source = path.join(assets, "large video.mp4");
  const file = await open(source, "w");
  try {
    await file.truncate(size);
    await file.write(Buffer.from("abcd"), 0, 4, 0);
    await file.write(Buffer.from("wxyz"), 0, 4, size - 4);
  } finally {
    await file.close();
  }
  await writeFile(path.join(assets, "small.mp4"), "small video");
  await symlink(source, path.join(assets, "already.mp4"));
  await writeFile(path.join(outputDirectory, "assets", "already.mp4"), "built asset");
  const outside = path.join(directory, "outside.mp4");
  const outsideFile = await open(outside, "w");
  await outsideFile.truncate(size);
  await outsideFile.close();
  await symlink(outside, path.join(assets, "escape.mp4"));

  const middleware = createLargeVideoPreviewMiddleware({ publicDirectory, outputDirectory });
  const server = createServer((request, response) => middleware(request, response, (error) => {
    response.writeHead(error ? 500 : 404);
    response.end(error ? "error" : "next");
  }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = base + "/assets/large%20video.mp4?cache=1";

  const complete = await fetch(url);
  assert.equal(complete.status, 200);
  assert.equal(complete.headers.get("content-length"), String(size));
  assert.equal(complete.headers.get("content-type"), "video/mp4");
  assert.equal(complete.headers.get("accept-ranges"), "bytes");
  assert.equal(complete.headers.get("cache-control"), "no-store");
  let received = 0;
  let first = Buffer.alloc(0);
  let last = Buffer.alloc(0);
  for await (const bytes of complete.body) {
    if (first.length < 4) first = Buffer.concat([first, bytes.subarray(0, 4 - first.length)]);
    last = Buffer.concat([last, bytes.subarray(-4)]).subarray(-4);
    received += bytes.byteLength;
  }
  assert.equal(received, size);
  assert.equal(Buffer.from(first).toString(), "abcd");
  assert.equal(Buffer.from(last).toString(), "wxyz");

  for (const [range, expected, start, end] of [
    ["bytes=0-0", "a", 0, 0],
    ["bytes=-4", "wxyz", size - 4, size - 1],
    [`bytes=${size - 1}-`, "z", size - 1, size - 1],
    [`bytes=${size - 4}-${size + 100}`, "wxyz", size - 4, size - 1],
  ]) {
    const response = await fetch(url, { headers: { range } });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${size}`, range);
    assert.equal(response.headers.get("content-length"), String(expected.length), range);
    assert.equal(await response.text(), expected, range);
  }
  const head = await fetch(url, { method: "HEAD", headers: { range: "bytes=0-0" } });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(size));
  assert.equal(head.headers.get("content-range"), null);
  assert.equal(await head.text(), "");

  const invalid = await fetch(url, { headers: { range: `bytes=${size}-` } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get("content-range"), "bytes */" + size);
  assert.equal(await invalid.text(), "");

  for (const pathname of [
    "/assets/small.mp4",
    "/assets/already.mp4",
    "/assets/missing.mp4",
    "/assets/escape.mp4",
    "/assets/%2e%2e%2f%2e%2e%2foutside.mp4",
    "/assets/%00large.mp4",
    "/assets/%ZZ.mp4",
    "/assets/app.js",
  ]) {
    const response = await fetch(base + pathname);
    assert.equal(response.status, 404, pathname);
    assert.equal(await response.text(), "next", pathname);
  }
  const post = await fetch(url, { method: "POST" });
  assert.equal(post.status, 404);
  assert.equal(await post.text(), "next");
});
