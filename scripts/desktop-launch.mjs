import path from "node:path";
// The override is for tests only; app data is still isolated by each smoke test.
export function desktopLaunchOptions(env) {
  const executablePath = process.env.CAPTURADESK_EXECUTABLE;
  delete env.CAPTURADESK_DEV_URL;
  return executablePath
    ? { executablePath: path.resolve(executablePath), args: [], env }
    : { args: ["."], env };
}
