import { task } from "@trigger.dev/sdk";
import { getDb } from "@/db/client";
import { AiClient, anthropicTransport } from "@/lib/ai/client";
import { failureMessage } from "@/lib/generation";

export type CheckAnthropicResult = { ok: true; model: string; requestId: string | null } | { ok: false; message: string };

// Settings > Connections "Check connection": one tiny call on the cheapest model, recorded like any other.
export const checkAnthropic = task({
  id: "check-anthropic",
  retry: { maxAttempts: 1 },
  run: async (): Promise<CheckAnthropicResult> => {
    try {
      const { call } = await new AiClient(getDb(), anthropicTransport()).text({
        purpose: "check",
        model: "claude-haiku-5-5",
        promptVersion: "check-1",
        effort: "low",
        maxTokens: 16,
        pack: "BrandFactory Marketing connection check.",
        instructions: "Reply with the single word OK.",
        user: "Check.",
      });
      return { ok: true, model: call.servedModel ?? call.requestedModel, requestId: call.requestId };
    } catch (error) {
      return { ok: false, message: failureMessage(error) };
    }
  },
});
