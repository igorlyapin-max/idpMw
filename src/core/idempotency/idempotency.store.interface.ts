export interface IdempotencyStore {
  setIfNotExists(key: string, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
}
