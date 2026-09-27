const { EventEmitter } = require("node:events");

// Storage and platform capture are injected so state transitions, ordering,
// recovery, and disk failures can be tested without monitoring the desktop.
class Recorder extends EventEmitter {
  constructor(
    storage,
    platform,
    { sampleMs = 650, settleMs = 350, maxPending = 12 } = {},
  ) {
    super();
    this.storage = storage;
    this.platform = platform;
    this.sampleMs = sampleMs;
    this.settleMs = settleMs;
    this.maxPending = maxPending;
    this.state = {
      status: "idle",
      count: 0,
      failed: 0,
      error: null,
      sessionId: null,
      startedAt: null,
      projectId: null,
      displayName: null,
      seen: 0,
      ignoredOwn: 0,
      ignoredOutside: 0,
      hint: null,
    };
    this.jobs = new Set();
    this.framePromise = null;
    this.latest = null;
    // Pause/stop advances this token. Async work must recheck it after awaits
    // so a frame from an earlier recording interval cannot become current.
    this.generation = 0;
    this.sequence = 0;
    platform.on("click", (e) => this.click(e));
    platform.on("fault", (e) => this.fail(e));
  }
  snapshot() {
    return { ...this.state };
  }
  publish(change = {}) {
    Object.assign(this.state, change);
    this.emit("state", this.snapshot());
  }
  async frame() {
    // Sampling and click jobs share one native request; nearby clicks may
    // therefore reference the same frame rather than overload screen capture.
    if (!this.framePromise)
      this.framePromise = this.platform.frame(this.session.display).finally(() => {
        this.framePromise = null;
      });
    return this.framePromise;
  }
  async sample(generation) {
    if (this.state.status !== "recording" || generation !== this.generation) return;
    try {
      const frame = await this.frame();
      if (generation === this.generation && this.state.status === "recording")
        this.latest = frame;
    } catch (e) {
      if (generation === this.generation) this.fail(e);
    }
    if (generation === this.generation && this.state.status === "recording")
      this.timer = setTimeout(() => this.sample(generation), this.sampleMs);
  }
  async start(input) {
    if (this.state.status !== "idle")
      throw new Error("A recording is already in progress.");
    const display = this.platform.listDisplays().find((d) => d.id === input.displayId);
    if (!display) throw new Error("Select an available display.");
    this.publish({
      status: "starting",
      count: 0,
      failed: 0,
      error: null,
      seen: 0,
      ignoredOwn: 0,
      ignoredOutside: 0,
      hint: null,
      displayName: display.name,
    });
    this.sequence = 0;
    try {
      this.session = this.storage.createSession(input, display);
      this.publish({
        sessionId: this.session.id,
        projectId: input.projectId,
        startedAt: this.session.startedAt,
      });
      this.latest = await this.frame();
      await this.platform.start();
      this.acceptingSince = Date.now();
      this.publish({ status: "recording" });
      this.sample(++this.generation);
      return this.snapshot();
    } catch (e) {
      this.platform.stop();
      if (this.session) {
        try {
          this.storage.sessionStatus(this.session.id, "interrupted", e.message);
        } catch {
          /* Recover active sessions on the next launch. */
        }
      }
      this.session = null;
      this.latest = null;
      this.publish({
        status: "idle",
        error: e.message,
        sessionId: null,
        projectId: null,
        startedAt: null,
      });
      throw e;
    }
  }
  click(event) {
    if (this.state.status !== "recording") return;
    if (
      !Number.isFinite(event.x) ||
      !Number.isFinite(event.y) ||
      !Number.isFinite(event.clickedAt) ||
      event.clickedAt < this.acceptingSince ||
      ![1, 2, 3, 4, 5].includes(event.button)
    )
      return;
    let point, application;
    try {
      this.platform.validateDisplay(this.session.display);
      const result = this.platform.classify
        ? this.platform.classify(event, this.session.display)
        : {
            point: this.platform.point(event, this.session.display),
            reason: "outside-display",
          };
      point = result.point;
      application = result.application;
      const change = { seen: this.state.seen + 1 };
      if (!point && result.reason === "outside-display") {
        change.ignoredOutside = this.state.ignoredOutside + 1;
        change.hint = `Clicks detected on ${result.actualDisplay || "another display"}. Recording ${this.state.displayName}.`;
      } else if (!point) {
        change.ignoredOwn = this.state.ignoredOwn + 1;
        change.hint =
          "Captura Desk controls are excluded. Click in the application you want to document.";
      } else change.hint = null;
      this.publish(change);
    } catch (e) {
      this.fail(e);
      return;
    }
    if (!point) return;
    if (this.jobs.size >= this.maxPending) {
      this.fail(
        new Error(
          "Clicks arrived faster than they could be saved. Recording paused; the triggering click was not captured.",
        ),
      );
      return;
    }
    const before =
      this.latest &&
      event.clickedAt - this.latest.capturedAt <= 2000 &&
      this.latest.capturedAt <= event.clickedAt
        ? this.latest
        : null;
    const generation = this.generation;
    let id;
    try {
      // Allocate sequence and row before awaiting image I/O to preserve click
      // order. The UI count means accepted events, not completed screenshot pairs.
      id = this.storage.addCapture(this.session.id, ++this.sequence, {
        clickedAt: event.clickedAt,
        button: event.button,
        application: typeof application === "string" ? application.slice(0, 120) : null,
        point,
        display: this.session.display,
        before: null,
        after: null,
      });
      this.publish({ count: this.state.count + 1 });
    } catch (e) {
      this.fail(e);
      return;
    }
    const job = this.saveClick(id, before, event.clickedAt, generation)
      .catch((e) => {
        try {
          this.storage.captureError(id, e.message);
        } catch {
          /* Storage itself may have failed. */
        }
        this.publish({ failed: this.state.failed + 1 });
        this.fail(e);
      })
      .finally(() => this.jobs.delete(job));
    this.jobs.add(job);
  }
  async captureNow() {
    if (this.state.status !== "recording")
      throw new Error("Resume recording before capturing a screenshot.");
    if (this.manualPending || this.jobs.size >= this.maxPending)
      throw new Error("A capture is still being saved. Try again shortly.");
    this.platform.validateDisplay(this.session.display);
    const generation = this.generation;
    const id = this.storage.addCapture(this.session.id, ++this.sequence, {
      clickedAt: Date.now(),
      trigger: "manual",
      button: null,
      point: null,
      application: null,
      display: this.session.display,
      before: null,
      after: null,
    });
    this.manualPending = true;
    this.publish({ count: this.state.count + 1, hint: "Capturing screenshot..." });
    const job = (async () => {
      // A manual capture requests a fresh frame rather than a sampled before-frame.
      const frame = await this.platform.frame(this.session.display);
      if (generation !== this.generation || this.state.status !== "recording")
        throw new Error("Manual capture canceled because recording paused or stopped.");
      await this.storage.saveFrame(id, "before", frame);
      this.emit("capture", id);
      this.publish({ hint: "Screenshot captured." });
    })()
      .catch((error) => {
        try {
          this.storage.captureError(id, error.message);
        } catch {}
        this.publish({ failed: this.state.failed + 1 });
        if (generation === this.generation) this.fail(error);
        throw error;
      })
      .finally(() => {
        this.jobs.delete(job);
        this.manualPending = false;
      });
    this.jobs.add(job);
    await job;
    return this.snapshot();
  }
  async saveClick(id, before, clickedAt, generation) {
    if (before) await this.storage.saveFrame(id, "before", before);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, clickedAt + this.settleMs - Date.now())),
    );
    if (this.state.status === "recording" && generation === this.generation) {
      const frame = await this.frame();
      // Pause/stop cancels any in-flight frame; no post-pause frame is persisted.
      if (this.state.status === "recording" && generation === this.generation)
        await this.storage.saveFrame(id, "after", frame);
      else if (!before)
        throw new Error("Recording paused before a screenshot was available.");
    } else if (!before)
      throw new Error("Recording stopped before a screenshot was available.");
    this.emit("capture", id);
  }
  pause(reason = null) {
    if (this.state.status !== "recording") return this.snapshot();
    clearTimeout(this.timer);
    this.generation++;
    this.latest = null;
    this.platform.pause();
    this.publish({ status: "paused", error: reason });
    try {
      this.storage.sessionStatus(this.session.id, "paused", reason);
    } catch (e) {
      this.publish({ error: `Could not save recording state: ${e.message}` });
    }
    return this.snapshot();
  }
  async resume() {
    if (this.state.status !== "paused") throw new Error("Recording is not paused.");
    if (this.resuming) throw new Error("Recording is already resuming.");
    this.resuming = true;
    const generation = this.generation;
    try {
      this.platform.validateDisplay(this.session.display);
      // Wait for any pre-pause request, then acquire a fresh frame.
      if (this.framePromise) await this.framePromise.catch(() => {});
      this.latest = await this.frame();
      if (generation !== this.generation || this.state.status !== "paused")
        throw new Error("Recording state changed while resuming.");
      this.platform.resume();
      this.storage.sessionStatus(this.session.id, "recording");
      this.acceptingSince = Date.now();
      this.publish({ status: "recording", error: null });
      this.sample(++this.generation);
      return this.snapshot();
    } finally {
      this.resuming = false;
    }
  }
  fail(error) {
    if (this.state.status === "recording") this.pause(error.message);
    else this.publish({ error: error.message });
  }
  async stop() {
    if (!["recording", "paused"].includes(this.state.status))
      throw new Error("No recording to finish.");
    clearTimeout(this.timer);
    this.generation++;
    this.platform.stop();
    this.latest = null;
    this.publish({ status: "stopping" });
    // Invalidate future after-frames first, then let already accepted writes
    // settle before materializing the editable document from the stored rows.
    await Promise.allSettled([...this.jobs]);
    if (this.framePromise) await this.framePromise.catch(() => {});
    let result;
    try {
      const emptyReason =
        this.state.count === 0
          ? this.state.seen === 0
            ? "No mouse clicks were received. Try starting a new recording."
            : this.state.ignoredOutside > 0
              ? `No clicks were captured on ${this.state.displayName}. Clicks on other displays were excluded.`
              : "Only Captura Desk controls were clicked; those clicks are excluded."
          : null;
      this.storage.sessionStatus(
        this.session.id,
        "complete",
        this.state.error || emptyReason,
      );
      if (emptyReason) this.publish({ hint: emptyReason });
      result = {
        sessionId: this.session.id,
        projectId: this.session.projectId,
        projects: this.storage.loadWorkspace(),
      };
    } catch (error) {
      this.publish({
        status: "paused",
        error: `Could not finish saving. Retry Finish: ${error.message}`,
      });
      throw error;
    }
    this.session = null;
    this.publish({
      status: "idle",
      sessionId: null,
      startedAt: null,
      projectId: null,
    });
    this.emit("finished", result);
    return result;
  }
  shutdown() {
    clearTimeout(this.timer);
    this.generation++;
    this.platform.stop();
    this.latest = null;
    if (this.session) {
      try {
        this.storage.sessionStatus(
          this.session.id,
          "interrupted",
          "Application closed during recording.",
        );
      } catch {}
    }
    this.publish({ status: "idle" });
  }
}
module.exports = { Recorder };
