// Self-contained export: no scripts, remote images, fonts, or runtime dependencies.
async function createHTML(storage, guide) {
  const [
    { createElement: h },
    { renderToStaticMarkup },
    { default: Markdown },
    { default: gfm },
  ] = await Promise.all([
    import("react"),
    import("react-dom/server"),
    import("react-markdown"),
    import("remark-gfm"),
  ]);
  const markdown = (text) =>
    h(
      Markdown,
      {
        remarkPlugins: [gfm],
        skipHtml: true,
        components: {
          img: ({ alt }) => h("span", null, `[Image: ${alt || "image"}]`),
          a: ({ href, children }) =>
            /^(https?:|mailto:|#)/i.test(href || "")
              ? h("a", { href, rel: "noreferrer" }, children)
              : h("span", null, children),
        },
      },
      text,
    );
  let imageBytes = 0;
  const sections = [];
  for (const [index, step] of guide.steps.entries()) {
    const images = [];
    for (const [sourceIndex, id] of (
      step.captureIds || (step.captureId ? [step.captureId] : [])
    ).entries()) {
      const row = storage.capture(id);
      if (!guide.sessionId || row.session_id !== guide.sessionId)
        throw Error("Screenshot does not belong to this recording.");
      const metadata = JSON.parse(row.metadata);
      let available = false;
      for (const frame of ["before", "after"]) {
        if (!row[`${frame}_file`]) continue;
        const image = await storage.image(id, frame);
        if (
          !image.dataUrl ||
          !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl)
        )
          throw Error("Screenshot unavailable. Nothing was exported.");
        imageBytes += image.dataUrl.length;
        if (imageBytes > 128 * 1024 * 1024)
          throw Error(
            "HTML export exceeds 128 MiB of images. Export a shorter document.",
          );
        const caption = `Source ${sourceIndex + 1} - ${metadata.trigger === "manual" ? "Manual screenshot" : frame === "before" ? "Before click" : "After click"}`;
        images.push(
          h(
            "figure",
            { key: `${id}-${frame}` },
            h("img", { src: image.dataUrl, alt: caption }),
            h("figcaption", null, caption),
          ),
        );
        available = true;
      }
      if (!available)
        images.push(
          h(
            "p",
            { key: id, className: "notice" },
            `Source ${sourceIndex + 1}: screenshot unavailable.`,
          ),
        );
    }
    sections.push(
      h(
        "section",
        { key: step.id },
        h("h2", null, `${index + 1}. ${step.title}`),
        markdown(step.description),
        ...images,
      ),
    );
  }
  const revision = guide.revision
    ? `Revision ${guide.revision}${guide.revisionLabel ? ` - ${guide.revisionLabel}` : ""}`
    : "Original";
  return (
    "<!doctype html>\n" +
    renderToStaticMarkup(
      h(
        "html",
        { lang: "en" },
        h(
          "head",
          null,
          h("meta", { charSet: "utf-8" }),
          h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
          h("meta", {
            httpEquiv: "Content-Security-Policy",
            content:
              "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
          }),
          h("title", null, guide.title),
          h(
            "style",
            null,
            `*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#262626;font:16px/1.65 system-ui,sans-serif}main{max-width:960px;margin:32px auto;padding:48px;background:white;border:1px solid #e5e5e5;border-radius:12px;overflow-wrap:anywhere}h1{font-size:2rem;line-height:1.2}h2{font-size:1.35rem}section{margin-top:36px;padding-top:20px;border-top:1px solid #e5e5e5}figure{margin:24px 0}img{display:block;max-width:100%;height:auto;border:1px solid #ddd;border-radius:6px}figcaption,.meta,footer,.notice{font-size:.85rem;color:#666}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#fafafa}pre{overflow-x:auto;background:#f5f5f5;padding:16px}code{background:#f5f5f5}blockquote{border-left:3px solid #ddd;margin-left:0;padding-left:16px}a{color:#4338ca}footer{margin-top:40px}@media(max-width:640px){main{margin:0;padding:24px;border:0;border-radius:0}}@media print{body{background:white}main{max-width:none;margin:0;padding:0;border:0}figure{break-inside:avoid}h1,h2,h3{break-after:avoid}pre{white-space:pre-wrap}}`,
          ),
        ),
        h(
          "body",
          null,
          h(
            "main",
            null,
            h(
              "header",
              null,
              h("h1", null, guide.title),
              h("p", { className: "meta" }, revision),
              markdown(guide.description),
            ),
            ...sections,
            h(
              "footer",
              null,
              guide.demo
                ? "Sample workflow. Screens are illustrative. Exported from Captura Desk."
                : "Exported from Captura Desk.",
            ),
          ),
        ),
      ),
    )
  );
}
module.exports = { createHTML };
