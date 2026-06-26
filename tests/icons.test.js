import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("activity icon picker includes shelter-focused choices", () => {
  const source = fs.readFileSync(new URL("../src/icons.jsx", import.meta.url), "utf8");
  assert.match(source, /name: "bed"/);
  assert.match(source, /name: "private-room"/);
  assert.match(source, /name: "legal"/);
  assert.match(source, /name: "case-legal"/);
  assert.ok((source.match(/\{ name: "/g) || []).length >= 28);
});
