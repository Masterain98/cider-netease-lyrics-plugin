export class RequestCoalescer {
  private readonly active = new Map<string, Promise<unknown>>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.active.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = operation().finally(() => this.active.delete(key));
    this.active.set(key, pending);
    return pending;
  }
}
