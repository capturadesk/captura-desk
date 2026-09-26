const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isOwnWindow } = require("../electron/recording/window-hit-test.cjs");
function window(id) {
  const handle = Buffer.alloc(8);
  handle.writeBigUInt64LE(BigInt(id));
  return {
    isDestroyed: () => false,
    getNativeWindowHandle: () => handle,
    isVisible: () => true,
    isMinimized: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1200 }),
  };
}
test("a different application over Captura Desk is not rejected by overlapping bounds", () => {
  assert.equal(isOwnWindow("200", [window(100)]), false);
});
test("actual clicks on Captura Desk and its floating toolbar are excluded", () => {
  assert.equal(isOwnWindow("100", [window(100), window(101)]), true);
  assert.equal(isOwnWindow("101", [window(100), window(101)]), true);
});
