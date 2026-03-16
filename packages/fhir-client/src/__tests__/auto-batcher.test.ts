/**
 * AutoBatcher Tests (BATCH-01)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoBatcher } from "../batch/auto-batcher.js";
import type { Bundle } from "../types/index.js";

describe("AutoBatcher", () => {
  let batcher: AutoBatcher;
  let executeBatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeBatch = vi.fn();
    batcher = new AutoBatcher({ enabled: true, windowMs: 10, maxSize: 5 });
    batcher.bind(executeBatch as any);
  });

  it("aggregates multiple writes into one batch", async () => {
    executeBatch.mockResolvedValue({
      resourceType: "Bundle",
      type: "batch-response",
      entry: [
        { response: { status: "201" }, resource: { resourceType: "Patient", id: "p-1" } },
        { response: { status: "201" }, resource: { resourceType: "Patient", id: "p-2" } },
      ],
    } as Bundle);

    const p1 = batcher.enqueue("POST", "Patient", { resourceType: "Patient", name: [{ family: "A" }] } as any);
    const p2 = batcher.enqueue("POST", "Patient", { resourceType: "Patient", name: [{ family: "B" }] } as any);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.id).toBe("p-1");
    expect(r2.id).toBe("p-2");
    expect(executeBatch).toHaveBeenCalledTimes(1);
    const sentBundle = executeBatch.mock.calls[0][0] as Bundle;
    expect(sentBundle.entry).toHaveLength(2);
  });

  it("flushes when maxSize reached", async () => {
    executeBatch.mockResolvedValue({
      resourceType: "Bundle", type: "batch-response",
      entry: Array(5).fill(null).map((_, i) => ({
        response: { status: "201" },
        resource: { resourceType: "Patient", id: `p-${i}` },
      })),
    } as Bundle);

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any));
    }
    await Promise.all(promises);
    expect(executeBatch).toHaveBeenCalledTimes(1);
  });

  it("window timeout triggers flush", async () => {
    executeBatch.mockResolvedValue({
      resourceType: "Bundle", type: "batch-response",
      entry: [{ response: { status: "200" }, resource: { resourceType: "Patient", id: "p-1" } }],
    } as Bundle);

    const p = batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any);
    // Wait for window timeout
    const result = await p;
    expect(result.id).toBe("p-1");
    expect(executeBatch).toHaveBeenCalledTimes(1);
  });

  it("rejects all entries on network failure", async () => {
    executeBatch.mockRejectedValue(new Error("network failure"));

    const p1 = batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any);
    const p2 = batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any);

    await expect(p1).rejects.toThrow("network failure");
    await expect(p2).rejects.toThrow("network failure");
  });

  it("rejects entry with error status", async () => {
    executeBatch.mockResolvedValue({
      resourceType: "Bundle", type: "batch-response",
      entry: [{ response: { status: "422" } }],
    } as Bundle);

    const p = batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any);
    await expect(p).rejects.toThrow("status 422");
  });

  it("manual flush works", async () => {
    executeBatch.mockResolvedValue({
      resourceType: "Bundle", type: "batch-response",
      entry: [{ response: { status: "200" }, resource: { resourceType: "Patient", id: "p-1" } }],
    } as Bundle);

    const p = batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any);
    await batcher.flush();
    const result = await p;
    expect(result.id).toBe("p-1");
  });

  it("setEnabled(false) flushes remaining queue", async () => {
    executeBatch.mockResolvedValue({
      resourceType: "Bundle", type: "batch-response",
      entry: [{ response: { status: "200" }, resource: { resourceType: "Patient", id: "p-1" } }],
    } as Bundle);

    const p = batcher.enqueue("POST", "Patient", { resourceType: "Patient" } as any);
    batcher.setEnabled(false);
    const result = await p;
    expect(result.id).toBe("p-1");
  });

  it("pendingCount reflects queue size", () => {
    // Don't bind so flush doesn't execute (we just want to check count)
    const b = new AutoBatcher({ enabled: true, windowMs: 99999 });
    b.bind(vi.fn().mockResolvedValue({ resourceType: "Bundle", type: "batch-response", entry: [] }));
    void b.enqueue("POST", "Patient");
    void b.enqueue("POST", "Patient");
    expect(b.pendingCount).toBe(2);
  });
});
