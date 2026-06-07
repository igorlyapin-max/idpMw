export interface IdempotencyStore {
  exists(key: string): Promise<boolean>;
  setIfNotExists(key: string, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
}
