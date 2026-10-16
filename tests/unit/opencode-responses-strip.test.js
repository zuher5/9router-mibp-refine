import { beforeEach, describe, expect, it } from "vitest";

// Responses-API lane: the /inference/v1/responses endpoint rejects chat-only
// fields, and the user-visible symptom was "connects then drops instantly" on
// muse-spark-* models. transformRequest() must clear body.messages.
describe("opencode executor responses lane", () => {
  let executor;

  beforeEach(async () => {
    const { OpenCodeExecutor } = await import("../../open-sse/executors/opencode.js");
    executor = new OpenCodeExecutor();
  });

  it("drops chat-only messages when converting chat bodies to Responses input", () => {
    const body = {
      model: "muse-spark-1.3-contributor-free",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
    };
    executor.transformRequest("muse-spark-1.3-contributor-free", body, true, {});
    expect(body.messages).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(Array.isArray(body.input)).toBe(true);
    expect(body.input[0].role).toBe("user");
  });

  it("keeps messages on the claude /messages lane (union-alpha)", () => {
    const body = {
      model: "union-alpha",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    };
    executor.transformRequest("union-alpha", body, true, {});
    expect(Array.isArray(body.messages)).toBe(true);
  });
});
