const path = require("node:path");

// Use Windows' actual hit test, not the bounds of windows behind the target.
// Loaded lazily so unsupported platforms can still open the workspace UI.
function createWindowHitTest() {
  const koffi = require("koffi");
  const user32 = koffi.load(
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "user32.dll"),
  );
  const point = koffi.struct("CapturaPoint", { x: "int32", y: "int32" });
  const windowFromPoint = user32.func("__stdcall", "WindowFromPoint", "uintptr_t", [
    point,
  ]);
  const getAncestor = user32.func("__stdcall", "GetAncestor", "uintptr_t", [
    "uintptr_t",
    "uint32",
  ]);
  return ({ x, y }) => String(getAncestor(windowFromPoint({ x, y }), 2));
}
function windowHandle(buffer) {
  return String(buffer.length === 8 ? buffer.readBigUInt64LE() : buffer.readUInt32LE());
}
function isOwnWindow(target, windows) {
  return windows.some(
    (window) =>
      !window.isDestroyed() &&
      windowHandle(window.getNativeWindowHandle()) === String(target),
  );
}
module.exports = { createWindowHitTest, isOwnWindow };
