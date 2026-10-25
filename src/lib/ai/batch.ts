import Anthropic from "@anthropic-ai/sdk";
import type { MessageBatchIndividualResponse } from "@anthropic-ai/sdk/resources/messages/batches";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { anthropicApiKey, SDK_RETRIES } from "./client";

// The Message Batches API (Phase 2 A4, orientation Q7): many requests in one submission, at half the price, done
// within 24 hours and usually within one. The only other place, beside client.ts, that talks to Anthropic. Tests pass a
// fake.

export type BatchRequest = { custom_id: string; params: MessageCreateParamsNonStreaming };
export type BatchStatus = { processingStatus: "in_progress" | "canceling" | "ended"; counts: { processing: number; succeeded: number; errored: number; canceled: number; expired: number } };

export type BatchTransport = {
  create(requests: readonly BatchRequest[]): Promise<{ id: string }>;
  retrieve(id: string): Promise<BatchStatus>;
  results(id: string): Promise<MessageBatchIndividualResponse[]>;
};

export function anthropicBatchTransport(apiKey: string = anthropicApiKey()): BatchTransport {
  const sdk = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: SDK_RETRIES });
  return {
    async create(requests) {
      const batch = await sdk.messages.batches.create({ requests: requests.map((request) => ({ custom_id: request.custom_id, params: request.params })) });
      return { id: batch.id };
    },
    async retrieve(id) {
      const batch = await sdk.messages.batches.retrieve(id);
      return { processingStatus: batch.processing_status, counts: batch.request_counts };
    },
    async results(id) {
      const all: MessageBatchIndividualResponse[] = [];
      for await (const result of await sdk.messages.batches.results(id)) all.push(result);
      return all;
    },
  };
}
