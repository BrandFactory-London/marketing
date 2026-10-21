import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetDomainTables, testDatabaseUrl } from "@/test/db";
import { aiCalls } from "@/db/schema";
import { AiClient, anthropicApiKey, buildParams, ModelOutputError, ModelRefusal, type CallRequest, type Transport } from "./client";

const request: CallRequest = {
  purpose: "writer",
  model: "claude-opus-5-5",
  promptVersion: "writer-1",
  effort: "high",
  maxTokens: 32000,
  pack: "# Knowledge pack",
  instructions: "Write the post.",
  user: "The spec.",
};

function reply(text: string, overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 5800, output_tokens: 8000, cache_creation_input_tokens: 0, cache_read_input_tokens: 1200 },
    ...overrides,
  } as Message;
}

function fake(message: Message | Error): Transport & { params: unknown[] } {
  const params: unknown[] = [];
  const transport = (async (input) => {
    params.push(input);
    if (message instanceof Error) throw message;
    return { message, requestId: "req_1" };
  }) as Transport & { params: unknown[] };
  transport.params = params;
  return transport;
}

describe("the API key", () => {
  it("prefers ANTHROPIC_API_KEY and falls back to the session's BFM_ANTHROPIC_API_KEY", () => {
    expect(anthropicApiKey({ ANTHROPIC_API_KEY: "a", BFM_ANTHROPIC_API_KEY: "b" })).toBe("a");
    expect(anthropicApiKey({ BFM_ANTHROPIC_API_KEY: "b" })).toBe("b");
    expect(() => anthropicApiKey({})).toThrow("Missing environment variable ANTHROPIC_API_KEY");
  });
});

describe("request parameters", () => {
  it("cache the pack, put the instructions after it and set the effort", () => {
    expect(buildParams(request)).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      system: [
        { type: "text", text: "# Knowledge pack", cache_control: { type: "ephemeral" } },
        { type: "text", text: "Write the post." },
      ],
      messages: [{ role: "user", content: "The spec." }],
      output_config: { effort: "high" },
    });
  });

  it("never ask for a fallback model", () => {
    expect(JSON.stringify(buildParams(request))).not.toContain("fallback");
  });
});

describe.skipIf(!testDatabaseUrl)("AI client (local Postgres)", () => {
  const { db, close } = createTestDb();
  afterAll(close);
  beforeEach(() => resetDomainTables(db));

  const rows = () => db.select().from(aiCalls);

  it("records a call with tokens, cost, served model and request id", async () => {
    const result = await new AiClient(db, fake(reply("# Draft\n"))).text(request);
    expect(result.text).toBe("# Draft");
    const [row] = await rows();
    expect(row).toMatchObject({
      purpose: "writer",
      requestedModel: "claude-opus-5-5",
      servedModel: "claude-opus-5-5",
      promptVersion: "writer-1",
      effort: "high",
      inputTokens: 5800,
      outputTokens: 8000,
      cacheWriteTokens: 0,
      cacheReadTokens: 1200,
      costUsd: 0.18344,
      stopReason: "end_turn",
      requestId: "req_1",
      error: null,
    });
  });

  it("fails a refusal with a clear message and does not retry", async () => {
    const transport = fake(reply("", { stop_reason: "refusal" }));
    await expect(new AiClient(db, transport).text(request)).rejects.toThrow(ModelRefusal);
    expect(transport.params).toHaveLength(1);
    const [row] = await rows();
    expect(row.stopReason).toBe("refusal");
    expect(row.error).toBe("claude-opus-5-5 declined to write this. Retry the post, or choose another model for the batch.");
  });

  it("fails a reply cut off at max tokens", async () => {
    await expect(new AiClient(db, fake(reply("# Half", { stop_reason: "max_tokens" }))).text(request)).rejects.toThrow(ModelOutputError);
    expect((await rows())[0].error).toContain("ran out of room");
  });

  it("records an API error with no tokens", async () => {
    await expect(new AiClient(db, fake(new Error("Overloaded"))).text(request)).rejects.toThrow("Overloaded");
    const [row] = await rows();
    expect(row).toMatchObject({ error: "Overloaded", inputTokens: 0, costUsd: 0, servedModel: null });
  });

  const Schema = z.object({ verdict: z.enum(["pass", "fail"]) });

  it("parses a structured reply and sends its schema", async () => {
    const transport = fake(reply('{"verdict":"pass"}'));
    const result = await new AiClient(db, transport).parsed({ ...request, purpose: "critic" }, Schema);
    expect(result.value).toEqual({ verdict: "pass" });
    expect(JSON.stringify(transport.params[0])).toContain('"type":"json_schema"');
  });

  it("fails a structured reply in the wrong shape and records why", async () => {
    await expect(new AiClient(db, fake(reply('{"verdict":"maybe"}'))).parsed(request, Schema)).rejects.toThrow("wrong shape");
    const [row] = await db.select().from(aiCalls).where(eq(aiCalls.purpose, "writer"));
    expect(row.error).toBe("claude-opus-5-5 returned a reply in the wrong shape.");
  });
});
