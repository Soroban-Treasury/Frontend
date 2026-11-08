import { BASE_FEE, Operation, TransactionBuilder, hash, rpc, xdr } from "@stellar/stellar-sdk";
import { transactionDeadline } from "treasury-sdk";
import type { Signer } from "treasury-sdk";
import { BUNDLED_WASM_HASH, BUNDLED_WASM_PATH, config, publicUrl } from "./config";

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("A contract code hash is 64 hex characters.");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 as hex. Works without WebCrypto, so also on plain-http hosts. */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(new Uint8Array(hash(bytes as never)));
}

/** The part of the RPC server this module uses, so tests can pass a fake. */
export interface CodeServer {
  getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<{ entries: unknown[] }>;
  getAccount(address: string): Promise<ConstructorParameters<typeof TransactionBuilder>[0]>;
  prepareTransaction(tx: ReturnType<TransactionBuilder["build"]>): Promise<{ toXDR(): string }>;
  sendTransaction(tx: ReturnType<typeof TransactionBuilder.fromXDR>): Promise<{ status: string; hash: string }>;
  pollTransaction(hash: string, opts?: { attempts?: number }): Promise<{ status: string }>;
  /** Lets the upload expire by the network's clock rather than this computer's. */
  getLatestLedger?(): Promise<{ sequence: number; closeTime?: string | number }>;
}

/** True when contract code with this hash is on the network. */
export async function isCodeOnNetwork(server: Pick<CodeServer, "getLedgerEntries">, hashHex: string): Promise<boolean> {
  const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: hexToBytes(hashHex) as never }));
  const { entries } = await server.getLedgerEntries(key);
  return entries.length > 0;
}

/** Load the bundled contract code and check it is exactly the code the app expects. */
export async function loadBundledCode(fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await fetcher(publicUrl(BUNDLED_WASM_PATH));
  if (!res.ok) throw new Error("Could not load the treasury contract code that comes with the app.");
  const wasm = new Uint8Array(await res.arrayBuffer());
  if (sha256Hex(wasm) !== BUNDLED_WASM_HASH) {
    throw new Error("The bundled contract code does not match its expected hash, so it was not uploaded.");
  }
  return wasm;
}

/** Upload contract code, signed and paid for by `signer`. Returns once the network has it. */
export async function uploadCode(
  server: CodeServer,
  signer: Signer,
  wasm: Uint8Array,
  networkPassphrase: string,
): Promise<void> {
  // Five minutes leaves time to read and approve the request in the wallet.
  const [account, maxTime] = await Promise.all([
    server.getAccount(signer.publicKey),
    transactionDeadline(server, 300),
  ]);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase, timebounds: { minTime: 0, maxTime } })
    .addOperation(Operation.uploadContractWasm({ wasm: wasm as never }))
    .build();
  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signer.signTransaction(prepared.toXDR(), { networkPassphrase });
  const sent = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, networkPassphrase));
  if (sent.status === "ERROR") throw new Error("The network rejected the contract code upload.");
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== "SUCCESS") throw new Error(`The contract code upload ended as ${done.status}.`);
}

/**
 * Make sure the treasury contract code is on the network and return its hash.
 * Uploads the bundled code first if the network does not have it yet (once per network).
 */
export async function ensureContractCode(opts: {
  signer: Signer;
  wasmHash?: string;
  server?: CodeServer;
  networkPassphrase?: string;
  fetcher?: typeof fetch;
  /** Called just before the upload, which needs its own wallet approval. */
  onUpload?: () => void;
}): Promise<string> {
  const hash = (opts.wasmHash ?? config.wasmHash).toLowerCase();
  const server = opts.server ?? (new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") }) as unknown as CodeServer);
  const passphrase = opts.networkPassphrase ?? config.networkPassphrase;

  if (await isCodeOnNetwork(server, hash)) return hash;
  if (hash !== BUNDLED_WASM_HASH) {
    throw new Error(
      `The contract code ${hash.slice(0, 8)}… is not on this network, and it is not the code bundled with the app. Upload it first.`,
    );
  }
  const wasm = await loadBundledCode(opts.fetcher);
  opts.onUpload?.();
  await uploadCode(server, opts.signer, wasm, passphrase);
  return hash;
}
