import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(".");

test("kiosk activity layout uses centered flex wrapping", () => {
  const kioskSource = fs.readFileSync(path.join(projectRoot, "src", "pages", "Kiosk.jsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
  assert.match(kioskSource, /data-activity-count=\{activities\.length\}/);
  assert.match(cssSource, /\.activity-grid\s*\{[^}]*display:\s*flex/s);
  assert.match(cssSource, /\.activity-grid\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(cssSource, /\.activity-grid\s*\{[^}]*justify-content:\s*center/s);
});
