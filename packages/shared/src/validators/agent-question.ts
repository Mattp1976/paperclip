import { z } from "zod";

export const askAgentQuestionSchema = z.object({
  question: z.string().min(1).max(2_000),
  /** Optional extra context shown below the question. */
  context: z.string().max(10_000).nullable().optional(),
  /** Origin run; lets the UI link back to the blocked run. */
  runId: z.string().uuid().nullable().optional(),
});

export type AskAgentQuestion = z.infer<typeof askAgentQuestionSchema>;

export const answerAgentQuestionSchema = z.object({
  answer: z.string().min(1).max(10_000),
});

export type AnswerAgentQuestion = z.infer<typeof answerAgentQuestionSchema>;
