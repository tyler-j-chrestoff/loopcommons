/**
 * Agent Memory — re-exports from @loopcommons/memory.
 *
 * This module delegates to the extracted memory package.
 * All types and functions are re-exported for backward compatibility.
 */

export {
  // Schemas
  MemoryTypeSchema,
  VisibilitySchema,
  ModalitySchema,
  ObservationMemorySchema,
  LearningMemorySchema,
  RelationshipMemorySchema,
  ReflectionMemorySchema,
  MemorySchema,
  // Functions
  isContradiction,
  createJsonFilePersistentState,
  formatMemoryContext,
} from '@loopcommons/memory';

export type {
  MemoryType,
  Visibility,
  Modality,
  ObservationMemory,
  LearningMemory,
  RelationshipMemory,
  ReflectionMemory,
  Memory,
  ObservationInput,
  LearningInput,
  RelationshipInput,
  ReflectionInput,
  MemoryInput,
  RecallQuery,
  MemoryStats,
  PersistentState,
} from '@loopcommons/memory';
