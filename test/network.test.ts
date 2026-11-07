import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Account, Keypair, Networks, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { keypairSigner } from "treasury-sdk";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_WASM_HASH, BUNDLED_WASM_PATH, publicUrl, resolveNetwork, treasuryHref } from "@/lib/config";
import { bytesToHex, ensureContractCode, hexToBytes, isCodeOnNetwork, loadBundledCode, sha256Hex } from "@/lib/contractCode";
import type { CodeServer } from "@/lib/contractCode";
import { networkMismatch, networkName } from "@/lib/wallet";

// Tests run from the app folder.
const wasmFile = join(process.cwd(), "public", BUNDLED_WASM_PATH);
const wasm = new Uint8Array(readFileSync(wasmFile));

describe("resolveNetwork", () => {
  it("defaults to testnet", () => {
    const n = resolveNetwork({});
    expect(n.name).toBe("testnet");
    expect(n.passphrase).toBe(Networks.TESTNET);
    expect(n.rpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(n.explorerUrl).toBe("https://stellar.expert/explorer/testnet");
  });

  it("has a mainnet preset with a public RPC", () => {
    const n = resolveNetwork({ network: "mainnet" });
    expect(n.passphrase).toBe(Networks.PUBLIC);
    expect(n.rpcUrl).toMatch(/^https:\/\//);
    expect(n.explorerUrl).toBe("https://stellar.expert/explorer/public");
    expect(n.label).toBe("Mainnet");
  });

  it("works out mainnet from the passphrase alone and keeps a given RPC", () => {
    const n = resolveNetwork({ passphrase: Networks.PUBLIC, rpcUrl: "https://rpc.example" });
    expect(n.name).toBe("mainnet");
    expect(n.rpcUrl).toBe("https://rpc.example");
  });

  it("treats any other passphrase as a custom network without an explorer", () => {
    const n = resolveNetwork({ passphrase: "Standalone Network ; February 2017", rpcUrl: "http://localhost:8000/rpc" });
    expect(n.name).toBe("custom");
    expect(n.explorerUrl).toBeNull();
    expect(n.rpcUrl).toBe("http://localhost:8000/rpc");
  });
});

describe("links", () => {
  it("puts the treasury id in the query string", () => {
    expect(treasuryHref("CABC")).toBe("/treasury/?id=CABC");
  });

  it("serves public files from the site root when there is no base path", () => {
    expect(publicUrl(BUNDLED_WASM_PATH)).toBe("/contract/treasury_contract.wasm");
  });
});

describe("wallet network check", () => {
  it("names the networks", () => {
    expect(networkName(Networks.TESTNET)).toBe("Testnet");
    expect(networkName(Networks.PUBLIC)).toBe("Mainnet");
    expect(networkName("something else")).toBe("a custom network");
  });

  it("says what to switch to when the wallet is on another network", () => {
    expect(networkMismatch(Networks.PUBLIC, Networks.TESTNET)).toMatch(/wallet is on Mainnet.*Switch the network in Freighter to Testnet/);
    expect(networkMismatch(Networks.TESTNET, Networks.TESTNET)).toBeNull();
    expect(networkMismatch(null, Networks.TESTNET)).toBeNull();
  });
});

describe("contract code", () => {
  it("bundles exactly the code its hash says", () => {
    expect(sha256Hex(wasm)).toBe(BUNDLED_WASM_HASH);
    // The wasm magic number.
    expect(Array.from(wasm.slice(0, 4))).toEqual([0, 0x61, 0x73, 0x6d]);
  });

  it("converts between hex and bytes", () => {
    expect(bytesToHex(hexToBytes(BUNDLED_WASM_HASH))).toBe(BUNDLED_WASM_HASH);
    expect(() => hexToBytes("abc")).toThrow(/64 hex/);
  });

  it("looks the code up by its hash", async () => {
    const getLedgerEntries = vi.fn(async (key: xdr.LedgerKey) => {
      // A contract-code ledger key (type 7) holding the bundled code hash.
      expect(key.toXDR("base64")).toBe("AAAABx9uW1PDrRU6yBOg8VvurDUrfnK4cxc39p5Q0se/G2QL");
      return { entries: [{}] };
    });
    expect(await isCodeOnNetwork({ getLedgerEntries }, BUNDLED_WASM_HASH)).toBe(true);
    expect(await isCodeOnNetwork({ getLedgerEntries: async () => ({ entries: [] }) }, BUNDLED_WASM_HASH)).toBe(false);
  });

  const okFetch = (async () => new Response(wasm)) as unknown as typeof fetch;

  it("loads the bundled code and refuses a file that does not match", async () => {
    expect(await loadBundledCode(okFetch)).toEqual(wasm);
    const tampered = (async () => new Response(new Uint8Array([0, 0x61, 0x73, 0x6d, 1]))) as unknown as typeof fetch;
    await expect(loadBundledCode(tampered)).rejects.toThrow(/does not match/);
    const missing = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(loadBundledCode(missing)).rejects.toThrow(/Could not load/);
  });

  function fakeServer(hasCode: boolean) {
    const source = Keypair.random();
    const sent: string[] = [];
    const server: CodeServer = {
      getLedgerEntries: async () => ({ entries: hasCode ? [{}] : [] }),
      getAccount: async (address) => new Account(address, "1"),
      prepareTransaction: async (tx) => tx,
      sendTransaction: async (tx) => {
        sent.push(tx.toXDR());
        return { status: "PENDING", hash: "upload-hash" };
      },
      pollTransaction: async () => ({ status: "SUCCESS" }),
    };
    return { server, sent, signer: keypairSigner(source), source };
  }

  it("does nothing when the network already has the code", async () => {
    const { server, sent, signer } = fakeServer(true);
    const onUpload = vi.fn();
    const hash = await ensureContractCode({ signer, server, networkPassphrase: Networks.TESTNET, onUpload });
    expect(hash).toBe(BUNDLED_WASM_HASH);
    expect(onUpload).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("uploads the bundled code once when the network does not have it", async () => {
    const { server, sent, signer, source } = fakeServer(false);
    const onUpload = vi.fn();
    const hash = await ensureContractCode({
      signer,
      server,
      networkPassphrase: Networks.TESTNET,
      fetcher: okFetch,
      onUpload,
    });
    expect(hash).toBe(BUNDLED_WASM_HASH);
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    const tx = TransactionBuilder.fromXDR(sent[0]!, Networks.TESTNET);
    expect("source" in tx && tx.source).toBe(source.publicKey());
    expect(tx.signatures).toHaveLength(1);
  });

  it("refuses to upload code other than the bundled code", async () => {
    const { server, signer } = fakeServer(false);
    await expect(
      ensureContractCode({ signer, server, networkPassphrase: Networks.TESTNET, wasmHash: "ab".repeat(32) }),
    ).rejects.toThrow(/not on this network/);
  });

  it("reports a failed upload", async () => {
    const { server, signer } = fakeServer(false);
    server.pollTransaction = async () => ({ status: "FAILED" });
    await expect(
      ensureContractCode({ signer, server, networkPassphrase: Networks.TESTNET, fetcher: okFetch }),
    ).rejects.toThrow(/ended as FAILED/);
  });
});
