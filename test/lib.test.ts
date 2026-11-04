import { describe, expect, it } from "vitest";
import type { Proposal } from "treasury-sdk";
import { AmountError, formatAmount, parseAmount, shortAddress, timeLeft } from "@/lib/amount";
import { loadSaved, removeTreasury, saveTreasury } from "@/lib/storage";
import type { KeyValueStore } from "@/lib/storage";
import { proposalState } from "@/lib/treasury";

describe("parseAmount", () => {
  it("turns text into the smallest unit", () => {
    expect(parseAmount("1")).toBe(10_000_000n);
    expect(parseAmount("12.5")).toBe(125_000_000n);
    expect(parseAmount("0.0000001")).toBe(1n);
    expect(parseAmount(" 3.10 ")).toBe(31_000_000n);
  });

  it("is exact for large amounts", () => {
    expect(parseAmount("123456789012345.1234567")).toBe(1_234_567_890_123_451_234_567n);
  });

  it.each([
    ["", "Enter an amount."],
    ["abc", "Use numbers only"],
    ["1,5", "Use numbers only"],
    ["-1", "Use numbers only"],
    ["1.", "Use numbers only"],
    ["0", "greater than zero"],
    ["0.0", "greater than zero"],
    ["1.12345678", "at most 7 decimal"],
  ])("rejects %j", (input, message) => {
    expect(() => parseAmount(input)).toThrow(AmountError);
    expect(() => parseAmount(input)).toThrow(message);
  });

  it("supports other decimals", () => {
    expect(parseAmount("1.5", 2)).toBe(150n);
    expect(() => parseAmount("1.555", 2)).toThrow(AmountError);
  });
});

describe("formatAmount", () => {
  it("turns the smallest unit into text", () => {
    expect(formatAmount(125_000_000n)).toBe("12.5");
    expect(formatAmount(10_000_000n)).toBe("1");
    expect(formatAmount(1n)).toBe("0.0000001");
    expect(formatAmount(0n)).toBe("0");
    expect(formatAmount(12_345_678_900_000n)).toBe("1,234,567.89");
    expect(formatAmount(-5_000_000n)).toBe("-0.5");
  });

  it("round-trips with parseAmount", () => {
    for (const text of ["1", "0.5", "999.9999999", "42.01"]) {
      expect(formatAmount(parseAmount(text))).toBe(text);
    }
  });
});

describe("shortAddress and timeLeft", () => {
  it("shortens long addresses and leaves short ones", () => {
    expect(shortAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ")).toBe("GABC…WXYZ");
    expect(shortAddress("GABC")).toBe("GABC");
  });

  it("describes time left", () => {
    expect(timeLeft(1000n, 1000)).toBe("expired");
    expect(timeLeft(1030n, 1000)).toBe("1 minute");
    expect(timeLeft(1000n + 3600n * 5n, 1000)).toBe("5 hours");
    expect(timeLeft(1000n + 86400n, 1000)).toBe("1 day");
    expect(timeLeft(1000n + 86400n * 3n + 5n, 1000)).toBe("3 days");
  });
});

describe("saved treasuries", () => {
  const fakeStore = (initial?: string): KeyValueStore & { value: string | null } => {
    const store = {
      value: initial ?? null,
      getItem: () => store.value,
      setItem: (_key: string, value: string) => {
        store.value = value;
      },
    };
    return store;
  };

  it("starts empty", () => {
    expect(loadSaved(fakeStore())).toEqual([]);
  });

  it("saves, renames and removes", () => {
    const store = fakeStore();
    saveTreasury({ id: "C1", name: "Team" }, store);
    saveTreasury({ id: "C2", name: "DAO" }, store);
    saveTreasury({ id: "C1", name: "Team A" }, store);
    expect(loadSaved(store)).toEqual([
      { id: "C2", name: "DAO" },
      { id: "C1", name: "Team A" },
    ]);
    expect(removeTreasury("C2", store)).toEqual([{ id: "C1", name: "Team A" }]);
  });

  it("ignores broken or foreign data", () => {
    expect(loadSaved(fakeStore("not json"))).toEqual([]);
    expect(loadSaved(fakeStore('{"a":1}'))).toEqual([]);
    expect(loadSaved(fakeStore('[{"id":"C1","name":"ok"},{"id":5},null,"x"]'))).toEqual([{ id: "C1", name: "ok" }]);
  });

  it("does not throw when storage fails", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadSaved(broken)).toEqual([]);
    expect(saveTreasury({ id: "C1", name: "Team" }, broken)).toEqual([{ id: "C1", name: "Team" }]);
    expect(loadSaved(undefined)).toEqual([]);
  });
});

describe("proposalState", () => {
  const base: Proposal = {
    id: 0n,
    proposer: "G1",
    asset: "C1",
    to: "G2",
    amount: 1n,
    approvals: ["G1"],
    executed: false,
    expiresAt: 2000n,
  };

  it("works out where a proposal stands", () => {
    expect(proposalState(base, 2, 1000)).toBe("open");
    expect(proposalState({ ...base, approvals: ["G1", "G3"] }, 2, 1000)).toBe("ready");
    expect(proposalState({ ...base, executed: true }, 2, 5000)).toBe("executed");
    expect(proposalState(base, 2, 2001)).toBe("expired");
    // On the last second it is still open, matching the contract.
    expect(proposalState(base, 2, 2000)).toBe("open");
  });
});
