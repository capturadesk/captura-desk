const { test } = require("node:test");
const assert = require("node:assert/strict");
const { paint } = require("../electron/annotations.cjs");
const { annotationSave } = require("../electron/contracts.cjs");
test("redaction covers outward-rounded pixels and wins over highlights", () => {
  const bytes = Buffer.alloc(10 * 10 * 4, 255);
  paint(bytes, 10, 10, [
    { kind: "redact", x: 0.15, y: 0.15, width: 0.2, height: 0.2 },
    { kind: "highlight", x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
  ]);
  for (let y = 1; y < 4; y++)
    for (let x = 1; x < 4; x++)
      assert.deepEqual(
        [...bytes.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 4)],
        [0, 0, 0, 255],
      );
  assert.deepEqual([...bytes.subarray(0, 4)], [255, 255, 255, 255]);
});
test("annotation boundary rejects oversized and malformed rectangles", () => {
  const input = {
    id: require("node:crypto").randomUUID(),
    frame: "before",
    boxes: [{ kind: "redact", x: 0.9, y: 0, width: 0.2, height: 0.1 }],
  };
  assert.equal(annotationSave.safeParse(input).success, false);
  assert.equal(
    annotationSave.safeParse({
      ...input,
      boxes: [{ kind: "redact", x: 0, y: 0, width: 0, height: 0.1 }],
    }).success,
    false,
  );
  assert.equal(annotationSave.safeParse({ ...input, boxes: [] }).success, true);
});
