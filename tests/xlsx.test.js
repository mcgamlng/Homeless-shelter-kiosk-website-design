import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbookBuffer } from "../server/xlsx.js";

test("creates a valid lightweight xlsx workbook package", () => {
  const buffer = createWorkbookBuffer([
    {
      name: "Summary",
      rows: [
        ["Metric", "Value"],
        ["Guests Checked In", 3]
      ]
    }
  ]);

  assert.equal(buffer.subarray(0, 2).toString("utf8"), "PK");
  assert.ok(buffer.includes(Buffer.from("xl/workbook.xml")));
  assert.ok(buffer.includes(Buffer.from("Guests Checked In")));
});
