#!/usr/bin/env node

import http from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8080;
const ROOT_DIR = resolve(process.cwd());

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function readArg(name, fallback) {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) {
    return fallback;
  }
  return value.slice(prefix.length);
}

const host = readArg("--host", DEFAULT_HOST);
const port = Number(readArg("--port", String(DEFAULT_PORT)));

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function resolveFilePath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const target = decoded === "/" ? "/index.html" : decoded;
  const absolute = resolve(ROOT_DIR, `.${target}`);

  if (!absolute.startsWith(ROOT_DIR)) {
    return null;
  }

  return absolute;
}

async function serveFile(req, res) {
  if (!req.url) {
    sendJson(res, 400, { error: "Invalid request URL" });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const filePath = resolveFilePath(requestUrl.pathname);
  if (!filePath) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    await access(filePath);
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": fileStat.size
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = http.createServer((req, res) => {
  serveFile(req, res).catch(() => {
    sendJson(res, 500, { error: "Internal server error" });
  });
});

server.on("error", (error) => {
  console.error(`Server error: ${error.message}`);
  process.exit(1);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

server.listen(port, host, () => {
  console.log(`Blog service listening on http://${host}:${port}`);
  console.log(`Serving directory: ${ROOT_DIR}`);
});
