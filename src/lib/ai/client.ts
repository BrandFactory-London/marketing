import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming, Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { eq } from "drizzle-orm";
import { callCost, isModelId } from "@/config/models";
import { aiCalls, type AiCallPurpose } from "@/db/schema";
import type { Executor } from "@/db/client";

// The only place that calls the Anthropic API (γ4 orientation Q5). Every call, failed or not, is recorded in
// ai_calls with the model that answered, tokens, cost and request id. A refusal fails the call with a clear
// message and is never retried on another model (orientation approval, Q5).

export type Effort = "low" | "medium" | "high";

// 10 minutes per call; the SDK retries twice before the task's own retries (Q6).
export const CALL_TIMEOUT_MS = 10 * 60 * 1000;
export const SDK_RETRIES = 2;

// Deployed Trigger.dev environments set ANTHROPIC_API_KEY. This build session holds its low-limit key as
// BFM_ANTHROPIC_API_KEY, since ANTHROPIC_API_KEY may be reserved there.
export function anthropicApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.ANTHROPIC_API_KEY || env.BFM_ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing environment variable ANTHROPIC_API_KEY (or BFM_ANTHROPIC_API_KEY for local runs).");
  return key;
}

// What the client needs from the SDK: one streamed request, returning the final message and its request id.
// Tests pass a fake.
export type Transport = (params: MessageCreateParamsNonStreaming) => Promise<{ message: Message; requestId: string | null }>;

export function anthropicTransport(apiKey: string = anthropicApiKey()): Transport {
  // The base URL is fixed so a session-wide ANTHROPIC_BASE_URL never redirects these calls.
  const sdk = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: SDK_RETRIES, timeout: CALL_TIMEOUT_MS });
  return async (params) => {
    const stream = sdk.messages.stream(params);
    const message = await stream.finalMessage();
    return { message, requestId: stream.request_id ?? null };
  };
}

export class ModelRefusal extends Error {
  constructor(model: string) {
    super(`${model} declined to write this. Retry the post, or choose another model for the batch.`);
    this.name = "ModelRefusal";
  }
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export type CallRequest = {
  purpose: AiCallPurpose;
  model: string;
  promptVersion: string;
  effort: Effort;
  maxTokens: number;
  // The knowledge pack, cached; then the role's instructions.
  pack: string;
  instructions: string;
  user: string;
  batchId?: string | null;
  postId?: string | null;
  // Backlog 24: keep a reply that cannot be read on the call record, so the cause can be seen.
  keepUnreadable?: boolean;
};

export type CallRecord = typeof aiCalls.$inferSelect;
// The most of an unreadable reply that is kept (backlog 24).
export const UNREADABLE_MAX = 20_000;
export type TextResult = { text: string; call: CallRecord };
export type ParsedResult<T> = { value: T; call: CallRecord };

// The request a parsed call sends, for the batch path to submit the same thing (Phase 2 A4).
export function parsedParams<T extends z.ZodType>(request: CallRequest, schema: T): MessageCreateParamsNonStreaming {
  return buildParams(request, { format: zodOutputFormat(schema) });
}

export function buildParams(request: CallRequest, format?: MessageCreateParamsNonStreaming["output_config"]): MessageCreateParamsNonStreaming {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: [
      { type: "text", text: request.pack, cache_control: { type: "ephemeral" } },
      { type: "text", text: request.instructions },
    ],
    messages: [{ role: "user", content: request.user }],
    output_config: { effort: request.effort, ...format },
  };
}

function textOf(message: Message): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export class AiClient {
  constructor(
    private readonly db: Executor,
    private readonly transport: Transport,
  ) {}

  // A Markdown reply, such as a draft.
  async text(request: CallRequest): Promise<TextResult> {
    const { message, call } = await this.send(request, buildParams(request));
    return this.readText(request, message, call);
  }

  // A reply in a Zod schema's shape, such as a spec or a verdict. A reply that does not fit is an error.
  async parsed<T extends z.ZodType>(request: CallRequest, schema: T): Promise<ParsedResult<z.infer<T>>> {
    const { message, call } = await this.send(request, parsedParams(request, schema));
    return this.readParsed(request, schema, message, call);
  }

  // A reply that came back from a message batch (Phase 2 A4): recorded at batch prices, then read as above.
  async textFromBatch(request: CallRequest, message: Message, requestId: string | null): Promise<TextResult> {
    const call = await this.record(request, message, requestId, 0, true);
    return this.readText(request, message, call);
  }

  async parsedFromBatch<T extends z.ZodType>(request: CallRequest, schema: T, message: Message, requestId: string | null): Promise<ParsedResult<z.infer<T>>> {
    const call = await this.record(request, message, requestId, 0, true);
    return this.readParsed(request, schema, message, call);
  }

  // A batch request that came back with no message: recorded with its error, as a failed real-time call is.
  async failedInBatch(request: CallRequest, error: string): Promise<void> {
    await this.db.insert(aiCalls).values({ ...this.base(request), batch: true, error });
  }

  private async readText(request: CallRequest, message: Message, call: CallRecord): Promise<TextResult> {
    const text = textOf(message).trim();
    if (!text) throw await this.fail(call, new ModelOutputError(`${request.model} returned no text.`));
    return { text, call };
  }

  private async readParsed<T extends z.ZodType>(request: CallRequest, schema: T, message: Message, call: CallRecord): Promise<ParsedResult<z.infer<T>>> {
    const raw = textOf(message);
    const keep = request.keepUnreadable ? { unstored: { raw: raw.slice(0, UNREADABLE_MAX) } } : {};
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw await this.fail(call, new ModelOutputError(`${request.model} returned a reply that is not JSON.`), keep);
    }
    const result = schema.safeParse(json);
    if (!result.success) throw await this.fail(call, new ModelOutputError(`${request.model} returned a reply in the wrong shape.`), keep);
    return { value: result.data, call };
  }

  private base(request: CallRequest) {
    return {
      batchId: request.batchId ?? null,
      postId: request.postId ?? null,
      purpose: request.purpose,
      requestedModel: request.model,
      promptVersion: request.promptVersion,
      effort: request.effort,
    };
  }

  private async send(request: CallRequest, params: MessageCreateParamsNonStreaming): Promise<{ message: Message; call: CallRecord }> {
    const started = Date.now();
    let response: Awaited<ReturnType<Transport>>;
    try {
      response = await this.transport(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const requestId = (error as { requestID?: string | null }).requestID ?? null;
      await this.db.insert(aiCalls).values({ ...this.base(request), durationMs: Date.now() - started, requestId, error: message });
      throw error;
    }
    const { message, requestId } = response;
    const call = await this.record(request, message, requestId, Date.now() - started, false);
    return { message, call };
  }

  // Records an answered call with its tokens and cost, then fails it on a refusal or a reply cut short.
  private async record(request: CallRequest, message: Message, requestId: string | null, durationMs: number, batch: boolean): Promise<CallRecord> {
    const usage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    };
    // Priced by the model that answered, which is the one billed, or by the model asked for if its id is new.
    const [call] = await this.db
      .insert(aiCalls)
      .values({
        ...this.base(request),
        ...usage,
        servedModel: message.model,
        costUsd: isModelId(message.model) ? callCost(message.model, usage, { batch }) : callCost(request.model, usage, { batch }),
        durationMs,
        stopReason: message.stop_reason,
        requestId,
        batch,
      })
      .returning();
    if (message.stop_reason === "refusal") throw await this.fail(call, new ModelRefusal(request.model));
    if (message.stop_reason === "max_tokens") {
      throw await this.fail(call, new ModelOutputError(`${request.model} ran out of room before finishing (${request.maxTokens} tokens).`));
    }
    return call;
  }

  private async fail(call: CallRecord, error: Error, extra: Partial<typeof aiCalls.$inferInsert> = {}): Promise<Error> {
    await this.db.update(aiCalls).set({ error: error.message, ...extra }).where(eq(aiCalls.id, call.id));
    return error;
  }
}
