const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHTML } = require("../electron/export-html.cjs");
const guide = {
  title: "A <report>",
  description: "**Summary**",
  revision: 2,
  revisionLabel: "Edited",
  sessionId: "session",
  steps: [
    {
      id: "s",
      title: "Check <status>",
      description: "| Item | Value |\n| --- | --- |\n| Total | 12 |\n\n- [x] Reviewed",
      captureId: "one",
      captureIds: ["one", "two"],
    },
  ],
};
test("HTML embeds edited frames and all section sources with Markdown and revision", async () => {
  const reads = [];
  const storage = {
    capture: (id) => ({
      session_id: "session",
      before_file: id,
      after_file: id === "one" ? "after" : null,
      metadata: JSON.stringify({ trigger: id === "two" ? "manual" : "click" }),
    }),
    image: async (id, frame, original) => {
      assert.notEqual(original, true);
      reads.push([id, frame]);
      return {
        dataUrl:
          "data:image/png;base64," +
          Buffer.from(`edited-${id}-${frame}`).toString("base64"),
      };
    },
  };
  const html = await createHTML(storage, guide);
  assert.deepEqual(reads, [
    ["one", "before"],
    ["one", "after"],
    ["two", "before"],
  ]);
  assert.equal((html.match(/<img /g) || []).length, 3);
  for (const [id, frame] of reads)
    assert.ok(html.includes(Buffer.from(`edited-${id}-${frame}`).toString("base64")));
  assert.match(html, /<strong>Summary<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /A &lt;report&gt;/);
  assert.match(html, /Revision 2 - Edited/);
  assert.match(html, /Manual screenshot/);
});
test("HTML excludes raw HTML, remote images, scripts and unsafe links", async () => {
  const html = await createHTML(
    {},
    {
      ...guide,
      title: "<script>alert(1)</script>",
      steps: [],
      description:
        "<script>alert(1)</script>\n\n![tracker](https://example.com/tracker.png)\n\n[bad](javascript:alert%281%29)\n\n[local](file:///secret)",
    },
  );
  assert.doesNotMatch(html, /<script|<img|href="(?:javascript|file):|tracker\.png/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src &#x27;none&#x27;/);
});
test("HTML rejects foreign captures and missing files rather than exporting originals", async () => {
  await assert.rejects(
    createHTML({ capture: () => ({ session_id: "other" }) }, guide),
    /does not belong/,
  );
  await assert.rejects(
    createHTML(
      {
        capture: () => ({ session_id: "session", metadata: "{}", before_file: "x" }),
        image: async () => ({ dataUrl: null }),
      },
      guide,
    ),
    /Screenshot unavailable/,
  );
});
