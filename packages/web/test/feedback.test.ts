import { describe, it, expect } from 'vitest';
import {
  FeedbackPayloadSchema,
  FeedbackRating,
  FeedbackCategory,
  createFeedbackEvent,
} from '../src/lib/feedback';
import type { FeedbackEvent } from '../src/lib/feedback';

describe('FeedbackPayloadSchema', () => {
  it('accepts valid positive feedback', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'positive',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid negative feedback with category', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'negative',
      category: 'inaccurate',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('inaccurate');
    }
  });

  it('accepts negative feedback without category', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'negative',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty messageId', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: '',
      sessionId: 'sess-456',
      rating: 'positive',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sessionId', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: 'msg-123',
      sessionId: '',
      rating: 'positive',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid rating', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'neutral',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = FeedbackPayloadSchema.safeParse({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'negative',
      category: 'boring',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(FeedbackPayloadSchema.safeParse({}).success).toBe(false);
    expect(FeedbackPayloadSchema.safeParse({ messageId: 'x' }).success).toBe(false);
  });
});

describe('FeedbackRating', () => {
  it('accepts positive and negative', () => {
    expect(FeedbackRating.safeParse('positive').success).toBe(true);
    expect(FeedbackRating.safeParse('negative').success).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(FeedbackRating.safeParse('neutral').success).toBe(false);
  });
});

describe('FeedbackCategory', () => {
  it('accepts all valid categories', () => {
    for (const cat of ['inaccurate', 'not_relevant', 'incomplete', 'harmful']) {
      expect(FeedbackCategory.safeParse(cat).success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    expect(FeedbackCategory.safeParse('boring').success).toBe(false);
  });
});

describe('createFeedbackEvent', () => {
  it('creates event with correct type and fields', () => {
    const event = createFeedbackEvent({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'positive',
    });
    expect(event.type).toBe('eval:feedback');
    expect(event.messageId).toBe('msg-123');
    expect(event.sessionId).toBe('sess-456');
    expect(event.rating).toBe('positive');
    expect(event.category).toBeUndefined();
    expect(event.timestamp).toBeTypeOf('number');
  });

  it('includes category for negative feedback', () => {
    const event = createFeedbackEvent({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'negative',
      category: 'harmful',
    });
    expect(event.category).toBe('harmful');
  });

  it('omits category key when not provided', () => {
    const event = createFeedbackEvent({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'positive',
    });
    expect('category' in event).toBe(false);
  });

  it('satisfies FeedbackEvent type', () => {
    const event: FeedbackEvent = createFeedbackEvent({
      messageId: 'msg-123',
      sessionId: 'sess-456',
      rating: 'negative',
      category: 'incomplete',
    });
    expect(event.type).toBe('eval:feedback');
  });
});
