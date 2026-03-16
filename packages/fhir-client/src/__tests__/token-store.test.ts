/**
 * Token Store Tests (AUTH-01)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TokenStore, MemoryTokenStorage } from "../auth/token-store.js";

describe("MemoryTokenStorage", () => {
  let storage: MemoryTokenStorage;
  beforeEach(() => { storage = new MemoryTokenStorage(); });

  it("set and get", () => {
    storage.set("key", "value");
    expect(storage.get("key")).toBe("value");
  });

  it("get returns null for missing key", () => {
    expect(storage.get("missing")).toBeNull();
  });

  it("delete removes key", () => {
    storage.set("key", "value");
    storage.delete("key");
    expect(storage.get("key")).toBeNull();
  });
});

describe("TokenStore", () => {
  let store: TokenStore;
  beforeEach(() => { store = new TokenStore(); });

  it("initially has no login state", () => {
    expect(store.getLoginState()).toBeUndefined();
  });

  it("stores and retrieves login state", () => {
    store.setLoginState({ accessToken: "at", refreshToken: "rt", expiresAt: 9999 });
    const state = store.getLoginState();
    expect(state?.accessToken).toBe("at");
    expect(state?.refreshToken).toBe("rt");
    expect(state?.expiresAt).toBe(9999);
  });

  it("getAccessToken returns token", () => {
    store.setLoginState({ accessToken: "at" });
    expect(store.getAccessToken()).toBe("at");
  });

  it("getRefreshToken returns token", () => {
    store.setLoginState({ accessToken: "at", refreshToken: "rt" });
    expect(store.getRefreshToken()).toBe("rt");
  });

  it("getExpiresAt returns number", () => {
    store.setLoginState({ accessToken: "at", expiresAt: 12345 });
    expect(store.getExpiresAt()).toBe(12345);
  });

  it("clear removes all tokens", () => {
    store.setLoginState({ accessToken: "at", refreshToken: "rt", expiresAt: 9999 });
    store.clear();
    expect(store.getAccessToken()).toBeUndefined();
    expect(store.getRefreshToken()).toBeUndefined();
    expect(store.getExpiresAt()).toBeUndefined();
  });

  it("getExpiresAt returns undefined when not set", () => {
    store.setLoginState({ accessToken: "at" });
    expect(store.getExpiresAt()).toBeUndefined();
  });
});
