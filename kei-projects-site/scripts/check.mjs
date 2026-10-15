import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(projectRoot, path), "utf8");
const html = read("public/index.html");
const css = read("public/styles.css");
const js = read("public/site.js");
const config = read("public/projects-config.js");
const firebase = JSON.parse(read("firebase.json"));

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

check("existing service entry routes remain temporary HTTPS redirects", () => {
  const entries = new Map(firebase.hosting.redirects.map((r) => [r.source, r]));
  assert.equal(entries.size, 3);
  const expected = {
    "/music": "https://kei-brstm-hub.vercel.app/",
    "/lounge": "https://kei-lounge-cards.vercel.app/",
    "/lounge/item-counter": "https://kei-lounge-cards.vercel.app/item-counter",
  };
  for (const [path, url] of Object.entries(expected)) {
    assert.equal(entries.get(path)?.destination, url);
    assert.equal(entries.get(path)?.type, 302);
    assert.match(html, new RegExp(`href="${path}"`));
  }
});

check("unverified Course Stats destination is hidden by default", () => {
  assert.match(html, /id="stats-card"[^>]*hidden/);
  assert.match(html, /id="stats-link"/);
  assert.match(css, /\.project-card\[hidden\]\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(html, /hasumimihate\.chatgpt\.site/);
  assert.match(html, /projects-config\.js/);
  assert.match(html, /site\.js/);
});

check("Course Stats link only activates with a valid HTTPS URL", () => {
  function mount(courseStatsUrl) {
    const card = { hidden: true };
    const link = { href: "#" };
    const window = { keiProjectsConfig: { courseStatsUrl } };
    const document = { getElementById: (id) => id === "stats-card" ? card : id === "stats-link" ? link : null };
    vm.runInNewContext(js, { window, document, URL });
    return { card, link };
  }
  assert.equal(mount("").card.hidden, true);
  assert.equal(mount("not-a-url").card.hidden, true);
  assert.equal(mount("http://example.org").card.hidden, true);
  assert.equal(mount("javascript:alert(1)").card.hidden, true);
  const { card, link } = mount("https://example.org/stats");
  assert.equal(card.hidden, false);
  assert.equal(link.href, "https://example.org/stats");
});

check("sample config contains no unverified URL", () => {
  const window = {};
  vm.runInNewContext(config, { window });
  assert.equal(window.keiProjectsConfig.courseStatsUrl, "");
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
