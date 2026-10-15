import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(projectRoot, path), "utf8");
const html = read("public/index.html");
const firebase = JSON.parse(read("firebase.json"));
const firebaseRc = JSON.parse(read(".firebaserc"));
const publishWorkflow = readFileSync(join(projectRoot, "..", ".github", "workflows", "publish-kei-projects.yml"), "utf8");

function check(label, run) {
  try {
    run();
    process.stdout.write(`PASS ${label}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${label}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

check("only no-cost Firebase Hosting is configured", () => {
  assert.deepEqual(Object.keys(firebase), ["hosting"]);
  assert.equal(firebase.hosting.public, "public");
  assert.equal(firebase.hosting.rewrites, undefined);
  assert.equal(firebase.hosting.predeploy, undefined);
});

check("deployment targets the confirmed Firebase Spark project", () => {
  assert.equal(firebaseRc.projects.default, "kei-projects-33b53");
  assert.match(publishWorkflow, /default: kei-projects-33b53/);
  assert.match(publishWorkflow, /This workflow is restricted to the approved Kei Projects Firebase project/);
});

check("all four entry points are direct HTTPS redirects", () => {
  const entries = new Map(firebase.hosting.redirects.map((r) => [r.source, r]));
  assert.equal(entries.size, 4);
  const expected = {
    "/music": "https://kei-brstm-hub.vercel.app/",
    "/lounge": "https://kei-lounge-cards.vercel.app/",
    "/lounge/item-counter": "https://kei-lounge-cards.vercel.app/item-counter",
    "/stats": "https://mkw-trackstats.pages.dev/",
  };
  for (const [path, url] of Object.entries(expected)) {
    assert.equal(entries.get(path)?.destination, url);
    assert.equal(entries.get(path)?.type, 302);
    assert.match(html, new RegExp(`href="${path}"`));
  }
});

check("Course Stats card is visible without JavaScript", () => {
  assert.match(html, /id="stats-card" aria-labelledby="stats-title">/);
  assert.match(html, /id="stats-link" href="\/stats"/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /hasumimihate\.chatgpt\.site/);
});

check("Firebase deployment remains manual and preview-first", () => {
  assert.match(publishWorkflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(publishWorkflow, /^  push:/m);
  assert.doesNotMatch(publishWorkflow, /^  pull_request:/m);
  assert.match(publishWorkflow, /default: preview/);
  assert.match(publishWorkflow, /channelId: kei-projects-preview/);
  assert.match(publishWorkflow, /channelId: live/);
  assert.match(publishWorkflow, /entryPoint: kei-projects-site/g);
  assert.match(publishWorkflow, /FIREBASE_SERVICE_ACCOUNT_KEI_PROJECTS/);
  assert.match(publishWorkflow, /Validate Spark-only Hosting configuration/);
});

check("Spark-restricted executable files are not shipped", () => {
  const restricted = /\.(exe|dll|bat|apk|ipa)$/i;
  const walk = (path) => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const fullPath = join(path, item.name);
      if (item.isDirectory()) walk(fullPath);
      else assert.equal(restricted.test(item.name), false, fullPath);
    }
  };
  walk(join(projectRoot, "public"));
});

if (process.exitCode) process.exit(process.exitCode);
