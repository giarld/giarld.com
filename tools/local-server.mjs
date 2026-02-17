#!/usr/bin/env node

import { execFile } from "node:child_process";
import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8080;
const ROOT_DIR = resolve(process.cwd());
const UPDATER_SCRIPT = resolve(ROOT_DIR, "tools/update-github-data.mjs");
const DEFAULT_SYNC_USERNAME = "giarld";
const DEFAULT_SYNC_OUTPUT = "data/github-data.json";
const DEFAULT_SYNC_INTERVAL_MINUTES = 60;
const execFileAsync = promisify(execFile);

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

function readBoolean(name, fallback) {
  const value = readArg(name, fallback ? "true" : "false").toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

const host = readArg("--host", DEFAULT_HOST);
const port = Number(readArg("--port", String(DEFAULT_PORT)));
const syncEnabled = readBoolean("--sync", process.env.BLOG_AUTO_SYNC !== "false");
const syncUsername = readArg("--sync-user", process.env.BLOG_SYNC_USER || DEFAULT_SYNC_USERNAME);
const syncOutput = readArg("--sync-output", process.env.BLOG_SYNC_OUTPUT || DEFAULT_SYNC_OUTPUT);
const requestedSyncIntervalMinutes = Number(
  readArg(
    "--sync-interval-minutes",
    process.env.BLOG_SYNC_INTERVAL_MINUTES || String(DEFAULT_SYNC_INTERVAL_MINUTES)
  )
);
const syncIntervalMinutes =
  Number.isFinite(requestedSyncIntervalMinutes) && requestedSyncIntervalMinutes > 0
    ? requestedSyncIntervalMinutes
    : DEFAULT_SYNC_INTERVAL_MINUTES;
const syncIntervalMs = syncIntervalMinutes * 60 * 1000;
let syncTimer = null;
let syncInProgress = false;

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

async function syncGithubData(trigger) {
  if (!syncEnabled || syncInProgress) {
    return;
  }

  if (!existsSync(UPDATER_SCRIPT)) {
    console.error(`[sync] updater script not found: ${UPDATER_SCRIPT}`);
    return;
  }

  syncInProgress = true;
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [UPDATER_SCRIPT, syncUsername, syncOutput],
      {
        cwd: ROOT_DIR,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 2 * 60 * 1000
      }
    );

    console.log(`[sync] ${trigger} completed in ${Date.now() - startedAt}ms`);
    if (stdout.trim()) {
      console.log(stdout.trim());
    }
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  } catch (error) {
    const detail = error.stderr || error.message;
    console.error(`[sync] ${trigger} failed: ${detail}`);
  } finally {
    syncInProgress = false;
  }
}

function startSyncScheduler() {
  if (!syncEnabled) {
    console.log("[sync] auto sync disabled");
    return;
  }

  syncTimer = setInterval(() => {
    void syncGithubData("hourly");
  }, syncIntervalMs);

  if (typeof syncTimer.unref === "function") {
    syncTimer.unref();
  }

  console.log(`[sync] auto sync enabled every ${syncIntervalMinutes} minute(s)`);
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
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  server.close(() => process.exit(0));
});

async function main() {
  await syncGithubData("startup");

  server.listen(port, host, () => {
    console.log(`Blog service listening on http://${host}:${port}`);
    console.log(`Serving directory: ${ROOT_DIR}`);
    startSyncScheduler();
  });
}

main().catch((error) => {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
});
