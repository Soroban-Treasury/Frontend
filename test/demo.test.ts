import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { NotEnoughApprovalsError, OverLimitError } from "treasury-sdk";
import { describe, expect, it, vi } from "vitest";
import { STEP_DEFINITIONS, runDemo } from "@/lib/demo";
import type { DemoClient, DemoDeps, DemoStep } from "@/lib/demo";

const ASSET = StrKey.encodeContract(Buffer.alloc(32, 5));
const TREASURY = StrKey.encodeContract(Buffer.alloc(32, 6));
const XLM = 10_000_000n;

/** A fake treasury that follows the real rules closely enough for the demo. */
function fakeTreasury() {
  const state = { approvals: 1, executed: false, spent: 0n, proposed: false };
  const client = (): DemoClient => ({
    contractId: TREASURY,
    async propose({ amount }) {
      if (amount > 50n * XLM) throw new OverLimitError();
      state.proposed = true;
      return { hash: "tx-propose", value: 0n };
    },
    async approve() {
      state.approvals += 1;
      return { hash: "tx-approve" };
    },
    async execute() {
      if (state.approvals < 2) throw new NotEnoughApprovalsError();
      state.executed = true;
      state.spent += 10n * XLM;
      return { hash: "tx-execute" };
    },
    async getSpent() {
      return state.spent;
    },
    async listProposals() {
      return [];
    },
  });
  return { state, client };
}

function deps(over: Partial<DemoDeps> = {}) {
  const treasury = fakeTreasury();
  const d: DemoDeps = {
    asset: ASSET,
    explorer: "https://explorer.test",
    fundAccount: vi.fn(async () => {}),
    uploadWasm: vi.fn(async () => "ab".repeat(32)),
    createTreasury: vi.fn(async () => treasury.client()),
    fundTreasury: vi.fn(async () => {}),
    clientFor: vi.fn(() => treasury.client()),
    ...over,
  };
  return { d, treasury };
}

describe("runDemo", () => {
  it("runs every step in order and ends with the treasury id", async () => {
    const { d, treasury } = deps();
    const updates: DemoStep[][] = [];
    const result = await runDemo(d, (s) => updates.push(s));

    expect(result.treasuryId).toBe(TREASURY);
    const last = updates.at(-1)!;
    expect(last.map((s) => s.id)).toEqual(STEP_DEFINITIONS.map((s) => s.id));
    expect(last.map((s) => s.status)).toEqual([
      "done", // owners
      "done", // upload
      "done", // create
      "done", // fund
      "done", // propose
      "refused", // early execute, one approval
      "done", // approve
      "done", // execute
      "refused", // over the limit
    ]);
    expect(treasury.state.executed).toBe(true);
    expect(d.fundAccount).toHaveBeenCalledTimes(2);
  });

  it("creates a 2-of-2 treasury with a 50 XLM per hour limit on the given asset", async () => {
    const { d } = deps();
    await runDemo(d, () => {});
    const args = vi.mocked(d.createTreasury).mock.calls[0]![0];
    expect(args.owners).toHaveLength(2);
    expect(args.threshold).toBe(2);
    expect(args.limits).toEqual([{ asset: ASSET, limit: 50n * XLM, periodSeconds: 3600 }]);
  });

  it("shows each step as running before it finishes", async () => {
    const { d } = deps();
    const seen: string[] = [];
    await runDemo(d, (steps) => {
      const running = steps.find((s) => s.status === "running");
      if (running && seen.at(-1) !== running.id) seen.push(running.id);
    });
    expect(seen).toEqual(STEP_DEFINITIONS.map((s) => s.id));
  });

  it("skips the upload when the network already has the contract code", async () => {
    const hash = "cd".repeat(32);
    const { d } = deps({ findWasmHash: async () => hash });
    await runDemo(d, () => {});
    expect(d.uploadWasm).not.toHaveBeenCalled();
    expect(vi.mocked(d.createTreasury).mock.calls[0]![0].wasmHash).toBe(hash);
  });

  it("uploads the contract code when the network does not have it", async () => {
    const { d } = deps({ findWasmHash: async () => null });
    await runDemo(d, () => {});
    expect(d.uploadWasm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.createTreasury).mock.calls[0]![0].wasmHash).toBe("ab".repeat(32));
  });

  it("links to the explorer for the contract and the transactions", async () => {
    const { d } = deps();
    let last: DemoStep[] = [];
    await runDemo(d, (s) => (last = s));
    const links = last.filter((s) => s.link).map((s) => s.link!.href);
    expect(links).toContain(`https://explorer.test/contract/${TREASURY}`);
    expect(links).toContain("https://explorer.test/tx/tx-execute");
  });

  it("stops at the failing step and leaves the rest waiting", async () => {
    const { d } = deps({
      fundAccount: vi.fn(async () => {
        throw new Error("The testnet faucet did not fund the account.");
      }),
    });
    let last: DemoStep[] = [];
    await expect(runDemo(d, (s) => (last = s))).rejects.toThrow(/faucet/);
    expect(last[0]!.status).toBe("failed");
    expect(last[0]!.detail).toMatch(/faucet/);
    expect(last.slice(1).every((s) => s.status === "waiting")).toBe(true);
    expect(d.createTreasury).not.toHaveBeenCalled();
  });

  it("fails if the treasury accepts something it should have refused", async () => {
    const treasury = fakeTreasury();
    const lenient = (): DemoClient => ({ ...treasury.client(), execute: async () => ({ hash: "tx" }) });
    const { d } = deps({ createTreasury: async () => lenient(), clientFor: () => lenient() });
    let last: DemoStep[] = [];
    await expect(runDemo(d, (s) => (last = s))).rejects.toThrow(/accepted something it should have refused/);
    expect(last.find((s) => s.id === "early")!.status).toBe("failed");
  });

  it("does not hide an unexpected error as a refusal", async () => {
    const treasury = fakeTreasury();
    const broken = (): DemoClient => ({
      ...treasury.client(),
      execute: async () => {
        throw new Error("network down");
      },
    });
    const { d } = deps({ createTreasury: async () => broken(), clientFor: () => broken() });
    await expect(runDemo(d, () => {})).rejects.toThrow("network down");
  });

  it("uses fresh owner keys each run", async () => {
    const a = deps();
    const b = deps();
    await runDemo(a.d, () => {});
    await runDemo(b.d, () => {});
    const first = vi.mocked(a.d.createTreasury).mock.calls[0]![0].owners;
    const second = vi.mocked(b.d.createTreasury).mock.calls[0]![0].owners;
    expect(first.every((o) => StrKey.isValidEd25519PublicKey(o))).toBe(true);
    expect(first).not.toEqual(second);
    expect(Keypair.random().publicKey()).toBeTruthy();
  });
});
