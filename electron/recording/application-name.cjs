const path = require("node:path");
function applicationName(executable) {
  const base = path.win32
    .basename(executable)
    .replace(/\.exe$/i, "")
    .slice(0, 120);
  const known = {
    chrome: "Google Chrome",
    msedge: "Microsoft Edge",
    firefox: "Mozilla Firefox",
    code: "Visual Studio Code",
    explorer: "File Explorer",
    notepad: "Notepad",
    winword: "Microsoft Word",
    excel: "Microsoft Excel",
    powerpnt: "Microsoft PowerPoint",
    outlook: "Microsoft Outlook",
    teams: "Microsoft Teams",
    "ms-teams": "Microsoft Teams",
  };
  return known[base.toLowerCase()] || base || null;
}
function createApplicationLookup() {
  const koffi = require("koffi");
  const system = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
  const user32 = koffi.load(path.join(system, "user32.dll"));
  const kernel32 = koffi.load(path.join(system, "kernel32.dll"));
  const processId = user32.func("__stdcall", "GetWindowThreadProcessId", "uint32", [
    "uintptr_t",
    "void *",
  ]);
  const open = kernel32.func("__stdcall", "OpenProcess", "uintptr_t", [
    "uint32",
    "int",
    "uint32",
  ]);
  const query = kernel32.func("__stdcall", "QueryFullProcessImageNameW", "int", [
    "uintptr_t",
    "uint32",
    "void *",
    "void *",
  ]);
  const close = kernel32.func("__stdcall", "CloseHandle", "int", ["uintptr_t"]);
  return (handle) => {
    const pid = Buffer.alloc(4);
    processId(BigInt(handle), pid);
    if (!pid.readUInt32LE()) return null;
    const process = open(0x1000, 0, pid.readUInt32LE());
    if (!process) return null;
    try {
      const buffer = Buffer.alloc(32768 * 2),
        length = Buffer.alloc(4);
      length.writeUInt32LE(32768);
      if (!query(process, 0, buffer, length)) return null;
      return applicationName(
        buffer.subarray(0, length.readUInt32LE() * 2).toString("utf16le"),
      );
    } finally {
      close(process);
    }
  };
}
module.exports = { applicationName, createApplicationLookup };
