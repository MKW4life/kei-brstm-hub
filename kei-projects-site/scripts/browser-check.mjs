import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(projectDir, "public");
const screenshotsDir = join(projectDir, "artifacts");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const sitePath = pathname === "/" ? "index.html" :
    pathname === "/stats" ? "stats.html" : pathname.replace(/^\/+/, "");
  const filename = resolve(publicDir, sitePath);
  if (!filename.startsWith(publicDir + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(filename)).isFile()) throw Error("Not a file");
    response.writeHead(200, {
      "content-type": types[extname(filename)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;
let browser;
try {
  await mkdir(screenshotsDir, { recursive: true });
  browser = await chromium.launch({ headless: true });

  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
    ["small-mobile", 320, 700],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    assert.equal(await page.title(), "Kei Projects");
    assert.equal(await page.getByRole("heading", { name: "Kei Projects" }).count(), 1);
    assert.equal(await page.locator(".project-card:visible").count(), 3);
    assert.equal(await page.locator("#stats-card").isVisible(), true);
    assert.equal(await page.locator("#stats-link").getAttribute("href"), "/stats");
    for (const [text, href] of [
      ["BRSTMを探す", "/music"],
      ["ラウンジカードを開く", "/lounge"],
      ["Item Counterを開く", "/lounge/item-counter"],
    ]) {
      const link = page.getByRole("link", { name: new RegExp(text) });
      assert.equal(await link.count(), 1);
      assert.equal(new URL(await link.getAttribute("href"), page.url()).pathname, href);
    }

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    assert.equal(horizontalOverflow, false, `Horizontal overflow at width ${width}`);
    assert.deepEqual(errors, [], `JavaScript errors on ${device}`);
    await page.screenshot({ path: join(screenshotsDir, `kei-projects-${device}.png`), fullPage: true });
    console.log(`PASS ${device} landing page links, layout, and screenshot`);

    // Stub the external site: test the redirect target without depending on Cloudflare availability.
    await page.route("https://mkw-trackstats.pages.dev/**", (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><head><title>Course Stats redirect test</title></head><body>Redirect OK</body></html>",
    }));
    await page.goto(`http://127.0.0.1:${port}/stats`, { waitUntil: "load" });
    await page.waitForURL("https://mkw-trackstats.pages.dev/");
    assert.equal(await page.title(), "Course Stats redirect test");
    assert.deepEqual(errors, [], `JavaScript errors on ${device} Stats redirect`);
    await page.close();
    console.log(`PASS ${device} live Stats destination redirect (stubbed)`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise((ok) => server.close(ok));
}
