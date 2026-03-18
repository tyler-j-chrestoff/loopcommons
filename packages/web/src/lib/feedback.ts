import { z } from 'zod';

// ---------------------------------------------------------------------------
// Feedback types — eval-01
// ---------------------------------------------------------------------------

/** Categories for negative feedback (thumbs-down). */
export const FeedbackCategory = z.enum([
  'inaccurate',
  'not_relevant',
  'incomplete',
  'harmful',
]);
export type FeedbackCategory = z.infer<typeof FeedbackCategory>;

/** Rating: positive (thumbs up) or negative (thumbs down). */
export const FeedbackRating = z.enum(['positive', 'negative']);
export type FeedbackRating = z.infer<typeof FeedbackRating>;

/** Schema for feedback POST body from the client. */
export const FeedbackPayloadSchema = z.object({
  messageId: z.string().min(1),
  sessionId: z.string().min(1),
  rating: FeedbackRating,
  category: FeedbackCategory.optional(),
});
export type FeedbackPayload = z.infer<typeof FeedbackPayloadSchema>;

/** The eval:feedback event persisted to session JSONL. */
export type FeedbackEvent = {
  type: 'eval:feedback';
  messageId: string;
  sessionId: string;
  rating: FeedbackRating;
  category?: FeedbackCategory;
  timestamp: number;
};

/** Create a FeedbackEvent from a validated payload. */
export function createFeedbackEvent(payload: FeedbackPayload): FeedbackEvent {
  return {
    type: 'eval:feedback',
    messageId: payload.messageId,
    sessionId: payload.sessionId,
    rating: payload.rating,
    ...(payload.category ? { category: payload.category } : {}),
    timestamp: Date.now(),
  };
}
