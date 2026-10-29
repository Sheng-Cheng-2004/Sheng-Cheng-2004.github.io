// Test-only adapter for Durable Object's JSON storage API.
export class MemoryStorage {
  constructor() { this.values = new Map(); this.alarmAt = null; }
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async setAlarm(time) { this.alarmAt = time; }
  async list({prefix}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
}
