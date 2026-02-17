#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const DEFAULT_USERNAME = "giarld";
const DEFAULT_OUTPUT = "data/github-data.json";
const execFileAsync = promisify(execFile);

function buildCurlArgs(url) {
  const args = [
    "-fsSL",
    "-H",
    "Accept: application/vnd.github+json",
    "-H",
    "User-Agent: gxin-blog-updater"
  ];

  if (process.env.GH_TOKEN) {
    args.push("-H", `Authorization: Bearer ${process.env.GH_TOKEN}`);
  }

  args.push(url);
  return args;
}

async function fetchJson(url) {
  const args = buildCurlArgs(url);
  let stdout;

  try {
    const output = await execFileAsync("curl", args, {
      maxBuffer: 12 * 1024 * 1024
    });
    stdout = output.stdout;
  } catch (error) {
    const detail = error.stderr || error.message;
    throw new Error(`Request failed for ${url}\n${detail}`);
  }

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Invalid JSON response for ${url}`);
  }
}

async function fetchAllRepos(username) {
  const repos = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/users/${username}/repos?per_page=100&sort=updated&page=${page}`;
    const batch = await fetchJson(url);

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    repos.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return repos;
}

function normalizeUser(user) {
  return {
    login: user.login,
    name: user.name,
    bio: user.bio,
    avatar_url: user.avatar_url,
    html_url: user.html_url,
    public_repos: user.public_repos,
    followers: user.followers,
    following: user.following,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

function normalizeRepo(repo) {
  return {
    name: repo.name,
    html_url: repo.html_url,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    fork: repo.fork,
    pushed_at: repo.pushed_at,
    updated_at: repo.updated_at
  };
}

async function main() {
  const username = process.argv[2] || DEFAULT_USERNAME;
  const outputFile = process.argv[3] || DEFAULT_OUTPUT;
  const outputPath = resolve(process.cwd(), outputFile);

  const userUrl = `https://api.github.com/users/${username}`;
  const user = await fetchJson(userUrl);
  const repos = await fetchAllRepos(username);

  const payload = {
    meta: {
      username,
      fetched_at: new Date().toISOString(),
      source: "github-api-v3"
    },
    user: normalizeUser(user),
    repos: repos.map(normalizeRepo)
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Updated ${outputPath}`);
  console.log(`User: ${payload.user.login} | repos: ${payload.repos.length}`);
  console.log(`Fetched at: ${payload.meta.fetched_at}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
