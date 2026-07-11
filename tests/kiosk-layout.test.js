import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(".");

test("kiosk activity layout uses centered flex wrapping", () => {
  const kioskSource = fs.readFileSync(path.join(projectRoot, "src", "pages", "Kiosk.jsx"), "utf8");
  const cssSource = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
  const activityLayoutSource = fs.readFileSync(
    path.join(projectRoot, "src", "kioskActivityLayout.css"),
    "utf8"
  );
  assert.match(kioskSource, /data-activity-count=\{activities\.length\}/);
  assert.match(kioskSource, /step-\$\{step\}/);
  assert.match(cssSource, /\.activity-grid\s*\{[^}]*display:\s*flex/s);
  assert.match(cssSource, /\.activity-grid\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(cssSource, /\.activity-grid\s*\{[^}]*justify-content:\s*center/s);
  assert.match(activityLayoutSource, /height:\s*auto\s*!important/);
  assert.doesNotMatch(activityLayoutSource, /height:\s*100%/);
  assert.match(activityLayoutSource, /min-height:\s*clamp\(88px,\s*13vh,\s*130px\)\s*!important/);
  assert.match(
    cssSource,
    /\.kiosk-shell\.is-activities\s+\.kiosk-next\s*\{[^}]*position:\s*sticky/s
  );
  assert.match(cssSource, /\.topbar\.is-kiosk-topbar\s*\{[^}]*flex-wrap:\s*nowrap/s);
  assert.match(cssSource, /\.topbar\.is-kiosk-topbar\s+\.brand\s*\{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.topbar\.is-kiosk-topbar\s*\+\s*main\s*\{[^}]*padding-top:\s*10px/s);
  assert.match(
    cssSource,
    /\.kiosk-stage\.step-activities\s+\.activity-grid\s*\{[^}]*display:\s*grid/s
  );
  assert.match(
    cssSource,
    /\.kiosk-stage\.step-activities\s+\.kiosk-shell\.is-activities\s*\{[^}]*overflow:\s*visible/s
  );
  assert.match(kioskSource, /plain-activities-shell/);
  assert.match(kioskSource, /plain-activity-card/);
  assert.match(cssSource, /\.plain-activity-grid\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.plain-activity-continue\s*\{[^}]*width:\s*min\(440px,\s*100%\)/s);
});
