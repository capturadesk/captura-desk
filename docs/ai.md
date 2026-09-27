# AI integration

Captura Desk supports user-supplied OpenAI and Anthropic API keys. Generation is explicit and occurs after recording; native capture still works without AI configured.

## Boundaries and credentials

Keys are entered in a password field and passed once through validated IPC to the main process. They are encrypted with Electron `safeStorage` before persistence in SQLite and never returned to the renderer. Connection status exposes only provider and whether a key exists. Encryption must be available; a plaintext backend is rejected. On Windows, this uses OS account protection, not protection against all software running as that user. Removing a key deletes its stored entry, not external backups or provider credentials.

Only fixed HTTPS endpoints are used: `api.openai.com/v1` and `api.anthropic.com/v1`. Redirects are rejected. Browser fetch and arbitrary renderer-supplied URLs are not used. Provider errors are mapped to safe messages instead of relaying response bodies. No screenshot or key logging is added.

## Generation lifecycle

1. The user configures a device-wide provider connection and a workspace default provider/model. Model listing tests account access; lists can include incompatible models and may be paginated by the provider. A model ID can also be entered directly.
2. The generation dialog shows the provider/model, lets the user preview and select 1-200 captures, and requires explicit consent. Input includes only those captures, normalized click/button metadata, the recording title/description, and project instructions. Per-step manual descriptions are not included in the prompt.
3. The editor flushes pending edits. The service verifies active workspace and document/capture ownership. One job is allowed at a time. Workspace mutations, destructive actions and recording start are blocked at IPC while generation is running.
4. The service flattens saved highlights and redactions before preparing JPEG copies at quality 80 with a maximum 1568-pixel longest edge. Original PNGs are untouched. Both available before/after frames are included; a capture with no frames is rejected. Prepared base64 images are capped at 24 MiB per batch.
5. OpenAI uses the Responses API with `store: false` and a strict JSON Schema. Anthropic uses Messages with `output_config.format`. Both use a 12,000-token output cap and a 180-second request timeout. Model listing uses 20 seconds. There are no automatic retries, cross-provider fallbacks, tool calls or computer actions.
6. The prompt treats screenshots as evidence, asks for uncertain claims to be flagged, and instructs the model not to reproduce secrets or follow instructions embedded in images. Prompt instructions do not hide pixels. Save redactions for both frames before generation, or exclude sensitive captures.
7. Individual batches return 1-20 sections; merged drafts support up to 200 sections with source-slot references. Sections can combine, reuse or reorder evidence according to project instructions. Local validation checks references, shape and text lengths before mapping source slots to database IDs. Unknown or empty references and malformed output are rejected. The previous fixed-slot format remains readable for saved drafts. Validation does not establish factual accuracy; review the source screenshots.
8. A validated draft stores source snapshot, output, provider/model, timestamp and prompt version. Saving it verifies the source snapshot is unchanged and creates a new editable document. The original is preserved. Uncertainty flags become visible review notes in saved step descriptions.

Abort signals cancel local generation and prevent canceled results from being persisted. A delivered request cannot be recalled and may still be billed. Closing the application or losing the main renderer aborts its job. A renderer reload can reconnect to job status through the generation dialog; completed drafts are durable. Generation is not resumed after process exit.

Provider retention policies still apply. OpenAI `store: false` is not a blanket zero-retention guarantee. The app does not upload until Generate is explicitly chosen; connection tests send credentials to the provider but no captures.

## Validation and remaining limits

`tests/ai.test.cjs` covers encryption failure, credential removal, selective uploads, source ownership, duplicate IDs, stale drafts, cancellation, persistence, cascade deletion, request formats and sanitized failures. `scripts/ai-smoke.mjs` covers both connection UIs, defaults, preview/exclusion/consent, cancellation, saved draft reload and non-destructive apply. It replaces transport inside the test process and uses fake keys and generated images; no production bypass or custom endpoint is installed.

These tests establish application behavior and expected request shapes, not live account/model compatibility or documentation quality. Live-provider testing must use a deliberately configured account and reviewed captures. This milestone has no per-request cost estimate, automatic model compatibility detection, live generation during capture.

## Official protocol references

- [OpenAI images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

See [data model](data-model.md) for retention and [codebase map](codebase-map.md#ai-documentation) for module ownership.

## Ask AI for edits

Use the refinement box below a document to request changes such as "make this shorter" or "use a more formal tone." Review the request and provider, select the consent checkbox, then click **Suggest edits**. Compare the draft with the current document and choose **Save as new document** to keep both versions.

Refinement supports documents with 1-200 steps and requests up to 4,000 characters. It sends the current title, description, step text, project instructions and edit request; it does not read or upload screenshot files. New refinement requests can combine, split, or reorder sections while retaining source screenshot references. This path uses validated `ai:refine` IPC and prompt version `v3-batched-refinement`, sharing generation's cancellation, output validation, durable drafts and stale-source checks.

## Prompt-shaped sections

New generation uses `v4-batched-document`. Each batch returns 1-20 sections; a final text-only merge can return up to 200, each citing one or more enumerated source slots; the adapter maps them to local capture IDs and rejects unknown or empty references. Project instructions decide document organization. Sections may merge or reuse sources, so document section IDs are generated locally and are independent of capture IDs. Text-only refinement supplies current sections as source slots and carries their underlying screenshot references forward. The legacy fixed-slot parser remains for compatibility tests; existing persisted drafts retain their original format.

## Long recordings

Generation accepts up to 200 selected captures; text refinement accepts up to 200 sections. Requests run sequentially in groups of at most 20 sources. Screenshot batches also stay within 24 MiB of base64 image data; a single oversized capture is rejected. Images are prepared one batch at a time. A multi-batch run makes an additional text-only request to combine sections into one document with up to 200 sections. The merge retains source references and review flags. Original project instructions and edit requests accompany every request. Generated prose still needs user review.

Progress identifies the current batch and merge phase. Canceling or failing any stage saves no partial draft and leaves the source unchanged; retry starts over and can incur additional provider charges. Each request retains its existing timeout and output-token limit. Merge text is limited to two million characters; oversized results fail explicitly rather than truncating content. No automatic retries occur.
