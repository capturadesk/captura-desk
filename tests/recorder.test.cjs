const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Recorder } = require("../electron/recording/recorder.cjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
class Platform extends EventEmitter {
  constructor() {
    super();
    this.frames = 0;
    this.running = false;
  }
  listDisplays() {
    return [
      {
        id: "1",
        name: "Display 1",
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
      },
    ];
  }
  validateDisplay() {
    if (this.changed) throw Error("Display changed");
  }
  point(e) {
    return e.x < 100 && e.y < 100 ? { x: e.x / 100, y: e.y / 100 } : null;
  }
  async frame() {
    this.frames++;
    if (this.frameError) throw Error("Capture unavailable");
    return {
      png: Buffer.from("frame"),
      capturedAt: Date.now(),
      width: 100,
      height: 100,
    };
  }
  async start() {
    this.running = true;
  }
  pause() {}
  resume() {}
  stop() {
    this.running = false;
  }
}
function fixture(options = {}) {
  const captures = [];
  const states = [];
  const storage = {
    createSession: (input) => ({
      id: "session",
      ...input,
      startedAt: Date.now(),
    }),
    sessionStatus: (_id, status) => states.push(status),
    addCapture: (_session, sequence, metadata) => {
      const id = String(sequence);
      captures.push({ id, sequence, metadata });
      return id;
    },
    saveFrame: async (id, kind, frame) => {
      captures.find((c) => c.id === id)[kind] = frame;
    },
    captureError: (id, error) => {
      captures.find((c) => c.id === id).error = error;
    },
    loadWorkspace: () => [],
  };
  const platform = new Platform();
  const recorder = new Recorder(storage, platform, {
    sampleMs: 10000,
    settleMs: 10,
    ...options,
  });
  return { storage, platform, recorder, captures, states };
}
const input = { projectId: "p", name: "Task", context: "", displayId: "1" };
function click(platform, x = 20) {
  platform.emit("click", { x, y: 40, button: 1, clickedAt: Date.now() });
}
test("preserves click order and normalized position across concurrent captures", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  click(f.platform);
  click(f.platform, 30);
  await wait(30);
  await f.recorder.stop();
  assert.deepEqual(
    f.captures.map((c) => c.sequence),
    [1, 2],
  );
  assert.deepEqual(f.captures[0].metadata.point, { x: 0.2, y: 0.4 });
  assert.ok(f.captures.every((c) => c.before && c.after));
  assert.equal(f.platform.running, false);
});
test("ignores other displays and invalid hook events", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  click(f.platform, 150);
  f.platform.emit("click", { x: NaN, y: 0 });
  assert.equal(f.captures.length, 0);
});
test("pause stops sampling, rejects clicks, cancels post-pause frames; resume uses a fresh frame", async (t) => {
  const f = fixture({ settleMs: 40 });
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  click(f.platform);
  f.recorder.pause();
  click(f.platform);
  await wait(60);
  assert.equal(f.captures.length, 1);
  assert.equal(f.captures[0].after, undefined);
  await f.recorder.resume();
  click(f.platform);
  await wait(60);
  assert.ok(f.captures[1].after);
});
test("stop drains accepted captures and leaves no running hook", async (t) => {
  const f = fixture({ settleMs: 30 });
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  click(f.platform);
  await f.recorder.stop();
  assert.equal(f.recorder.state.status, "idle");
  assert.ok(f.captures[0].before);
  assert.equal(f.recorder.jobs.size, 0);
  assert.ok(f.states.includes("complete"));
});
test("disk failure pauses recording and retains a visible failed capture", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  f.storage.saveFrame = async () => {
    throw Error("Disk full");
  };
  await f.recorder.start(input);
  click(f.platform);
  await wait(20);
  assert.equal(f.recorder.state.status, "paused");
  assert.equal(f.recorder.state.failed, 1);
  assert.match(f.recorder.state.error, /Disk full/);
});
test("bounded pending captures pause with explicit backpressure", async (t) => {
  const f = fixture({ maxPending: 1, settleMs: 30 });
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  click(f.platform);
  click(f.platform);
  assert.equal(f.captures.length, 1);
  assert.equal(f.recorder.state.status, "paused");
  assert.match(f.recorder.state.error, /not captured/);
  await f.recorder.stop();
});
test("display changes and helper failures pause safely", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  f.platform.changed = true;
  click(f.platform);
  assert.equal(f.recorder.state.status, "paused");
  await assert.rejects(f.recorder.resume(), /Display changed/);
  f.platform.changed = false;
  await f.recorder.resume();
  f.platform.emit("fault", Error("Helper exited"));
  assert.equal(f.recorder.state.status, "paused");
});
test("failed startup returns to idle and marks the session interrupted", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  f.platform.frameError = true;
  await assert.rejects(f.recorder.start(input), /Capture unavailable/);
  assert.equal(f.recorder.state.status, "idle");
  assert.ok(f.states.includes("interrupted"));
  assert.equal(f.platform.running, false);
});
test("concurrent start is rejected", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  const first = f.recorder.start(input);
  await assert.rejects(f.recorder.start(input), /already/);
  await first;
});

test("diagnostics distinguish received clicks, other displays, and app controls", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  f.platform.classify = () => ({ point: null, reason: "app-window" });
  click(f.platform);
  assert.equal(f.recorder.state.seen, 1);
  assert.equal(f.recorder.state.ignoredOwn, 1);
  assert.match(f.recorder.state.hint, /controls/);
  f.platform.classify = () => ({ point: null, reason: "outside-display" });
  click(f.platform);
  assert.equal(f.recorder.state.ignoredOutside, 1);
  assert.match(f.recorder.state.hint, /another display/);
  f.platform.classify = () => ({ point: { x: 0.2, y: 0.4 } });
  click(f.platform);
  assert.equal(f.recorder.state.count, 1);
  assert.equal(f.recorder.state.hint, null);
  await f.recorder.stop();
});

test("stale click events from before resume are ignored", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  const old = Date.now();
  f.recorder.pause();
  await wait(5);
  await f.recorder.resume();
  f.platform.emit("click", { x: 20, y: 40, button: 1, clickedAt: old });
  assert.equal(f.captures.length, 0);
});

test("finish can be retried after a metadata storage failure", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  const original = f.storage.sessionStatus;
  f.storage.sessionStatus = () => {
    throw Error("Disk full");
  };
  await assert.rejects(f.recorder.stop(), /Disk full/);
  assert.equal(f.recorder.state.status, "paused");
  assert.equal(f.platform.running, false);
  f.storage.sessionStatus = original;
  await f.recorder.stop();
  assert.equal(f.recorder.state.status, "idle");
});

test("a concurrent stop prevents resume from restarting capture", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.shutdown());
  await f.recorder.start(input);
  f.recorder.pause();
  // Finish any sampling request from startup before testing a delayed resume.
  if (f.recorder.framePromise) await f.recorder.framePromise;
  let release;
  f.platform.frame = () =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          png: Buffer.from("frame"),
          capturedAt: Date.now(),
          width: 100,
          height: 100,
        });
    });
  const resume = f.recorder.resume();
  const rejected = assert.rejects(resume, /state changed/);
  const stop = f.recorder.stop();
  release();
  await rejected;
  await stop;
  assert.equal(f.recorder.state.status, "idle");
  assert.equal(f.platform.running, false);
});

test("accepted clicks retain the detected application name", async () => {
  const { recorder, platform, captures } = fixture();
  platform.classify = (event) => ({
    point: platform.point(event),
    application: "Google Chrome",
  });
  await recorder.start(input);
  click(platform);
  await recorder.stop();
  assert.equal(captures[0].metadata.application, "Google Chrome");
});

test("manual captures save a fresh single frame without a fake click and reject paused requests", async () => {
  const f = fixture();
  await assert.rejects(f.recorder.captureNow(), /Resume/);
  await f.recorder.start(input);
  const before = f.platform.frames;
  await f.recorder.captureNow();
  assert.ok(f.platform.frames > before);
  assert.equal(f.captures[0].metadata.trigger, "manual");
  assert.equal(f.captures[0].metadata.point, null);
  assert.ok(f.captures[0].before);
  assert.equal(f.captures[0].after, undefined);
  f.recorder.pause();
  await assert.rejects(f.recorder.captureNow(), /Resume/);
  await f.recorder.stop();
});

test("pause discards an in-flight manual frame and duplicate requests are rejected", async () => {
  const f = fixture();
  await f.recorder.start(input);
  let release;
  f.platform.frame = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const request = f.recorder.captureNow();
  const rejected = assert.rejects(request, /canceled/);
  await assert.rejects(f.recorder.captureNow(), /still being saved/);
  f.recorder.pause();
  release({ png: Buffer.from("late"), width: 10, height: 10, capturedAt: Date.now() });
  await rejected;
  assert.equal(f.captures[0].before, undefined);
  assert.match(f.captures[0].error, /canceled/);
  await f.recorder.stop();
});
