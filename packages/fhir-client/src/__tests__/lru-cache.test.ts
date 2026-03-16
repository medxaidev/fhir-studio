/**
 * LRU Cache Tests (CACHE-01)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LRUCache } from "../cache/lru-cache.js";

describe("LRUCache", () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3, 0);
  });

  it("stores and retrieves values", () => {
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest when at capacity", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4"); // evicts "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("d")).toBe("4");
  });

  it("access moves item to most-recently-used", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.get("a"); // touch "a" — now "b" is oldest
    cache.set("d", "4"); // evicts "b"
    expect(cache.get("a")).toBe("1");
    expect(cache.get("b")).toBeUndefined();
  });

  it("overwrite updates existing key", () => {
    cache.set("a", "1");
    cache.set("a", "2");
    expect(cache.get("a")).toBe("2");
    expect(cache.size).toBe(1);
  });

  it("delete removes a key", () => {
    cache.set("a", "1");
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
  });

  it("clear empties cache", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("has returns true for existing, false for missing", () => {
    cache.set("a", "1");
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("keys returns all keys", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    expect([...cache.keys()]).toEqual(["a", "b"]);
  });
});

describe("LRUCache with TTL", () => {
  it("returns undefined for expired items", () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string>(100, 1000); // 1s TTL
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");

    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("returns value before TTL expires", () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string>(100, 1000);
    cache.set("a", "1");
    vi.advanceTimersByTime(500);
    expect(cache.get("a")).toBe("1");
    vi.useRealTimers();
  });

  it("has returns false for expired items", () => {
    vi.useFakeTimers();
    const cache = new LRUCache<string>(100, 100);
    cache.set("a", "1");
    vi.advanceTimersByTime(200);
    expect(cache.has("a")).toBe(false);
    vi.useRealTimers();
  });

  it("capacity=0 means unlimited", () => {
    const cache = new LRUCache<string>(0, 0);
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, `v${i}`);
    expect(cache.size).toBe(100);
    expect(cache.get("k0")).toBe("v0");
  });
});
