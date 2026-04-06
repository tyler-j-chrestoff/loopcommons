import { createInMemoryIdentityStore } from '@loopcommons/llm';
import type { IdentityStore } from '@loopcommons/llm';

let store: IdentityStore | undefined;

export function getIdentityStore(): IdentityStore {
  if (!store) {
    store = createInMemoryIdentityStore();
  }
  return store;
}
