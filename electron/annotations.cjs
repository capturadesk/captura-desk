// Flatten annotations into the native BGRA bitmap. Redactions run last and use
// outward rounding, so highlights cannot reveal any covered source pixels.
function paint(bitmap, width, height, boxes) {
  for (const box of [...boxes].sort(
    (a, b) => (a.kind === "redact") - (b.kind === "redact"),
  )) {
    const x0 = Math.floor(box.x * width),
      y0 = Math.floor(box.y * height);
    const x1 = Math.min(width, Math.ceil((box.x + box.width) * width));
    const y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
    const edge = Math.max(2, Math.round(Math.min(width, height) / 250));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (
          box.kind === "highlight" &&
          x >= x0 + edge &&
          x < x1 - edge &&
          y >= y0 + edge &&
          y < y1 - edge
        )
          continue;
        const i = (y * width + x) * 4;
        bitmap[i] = 0;
        bitmap[i + 1] = box.kind === "redact" ? 0 : 200;
        bitmap[i + 2] = box.kind === "redact" ? 0 : 255;
        bitmap[i + 3] = 255;
      }
  }
  return bitmap;
}
function render(nativeImage, png, boxes) {
  const image = nativeImage.createFromBuffer(png);
  if (image.isEmpty()) throw new Error("Cannot read screenshot for annotation");
  const { width, height } = image.getSize();
  const bitmap = paint(image.toBitmap(), width, height, boxes);
  return nativeImage.createFromBitmap(bitmap, { width, height }).toPNG();
}
module.exports = { paint, render };
