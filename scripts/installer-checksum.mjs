import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const name = "CapturaDesk-Setup-" + pkg.version + "-x64.exe";
const target = path.join("release", name);
const hash = createHash("sha256")
  .update(await fs.readFile(target))
  .digest("hex");
await fs.writeFile(target + ".sha256", hash + "  " + name + "\n");
console.log("Installer: " + target + "\nSHA256: " + hash);
