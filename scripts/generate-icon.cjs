// Run with Node; Electron supplies its image decoder without opening a window.
const path = require("node:path");
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require("node:child_process").spawnSync(
    require("electron"),
    [__filename],
    { env, stdio: "inherit", windowsHide: true },
  );
  process.exit(result.status ?? 1);
} else {
  const { app, nativeImage } = require("electron");
  app
    .whenReady()
    .then(() => {
      const source = nativeImage.createFromPath(
        path.join(__dirname, "../assets/icon.png"),
      );
      if (source.isEmpty()) throw new Error("assets/icon.png is not a readable image.");
      const { width, height } = source.getSize();
      if (width !== height) throw new Error("The app icon must be square.");
      const sizes = [16, 24, 32, 48, 64, 128, 256];
      const frames = sizes.map((size) =>
        source.resize({ width: size, height: size, quality: "best" }).toPNG(),
      );
      const header = Buffer.alloc(6 + 16 * frames.length);
      header.writeUInt16LE(1, 2);
      header.writeUInt16LE(frames.length, 4);
      let offset = header.length;
      frames.forEach((frame, index) => {
        const entry = 6 + index * 16;
        header[entry] = header[entry + 1] = sizes[index] % 256;
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(frame.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += frame.length;
      });
      require("node:fs").writeFileSync(
        path.join(__dirname, "../assets/icon.ico"),
        Buffer.concat([header, ...frames]),
      );
      console.log(
        `Generated assets/icon.ico from ${width} x ${height} PNG (${sizes.join(", ")} px).`,
      );
      app.quit();
    })
    .catch((error) => {
      console.error(error.message);
      app.exit(1);
    });
}
