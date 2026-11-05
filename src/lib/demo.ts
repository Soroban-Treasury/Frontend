import { Address, BASE_FEE, Contract, Keypair, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
import { NotEnoughApprovalsError, OverLimitError, TreasuryClient, keypairSigner } from "treasury-sdk";
import type { LimitInit, Proposal, Signer } from "treasury-sdk";
import { config } from "./config";
import { nativeAssetId } from "./treasury";

/** One XLM in the smallest unit. */
const XLM = 10_000_000n;
const LIMIT = 50n * XLM;
const PERIOD_SECONDS = 3600;

export type StepStatus = "waiting" | "running" | "done" | "refused" | "failed";

export interface DemoStep {
  id: string;
  title: string;
  /** What this step shows, in plain words. */
  why: string;
  status: StepStatus;
  /** What happened, once the step has run. */
  detail?: string;
  link?: { href: string; label: string };
}

export const STEP_DEFINITIONS: Pick<DemoStep, "id" | "title" | "why">[] = [
  {
    id: "owners",
    title: "Create two owners",
    why: "Two throwaway accounts, funded by Stellar's testnet faucet. In real use these are your team's own wallets.",
  },
  {
    id: "upload",
    title: "Put the contract on the network",
    why: "The treasury's code (about 13 KB) is uploaded once. Its hash identifies exactly which code a treasury runs.",
  },
  {
    id: "create",
    title: "Create the treasury",
    why: "Owners, approvals needed (2 of 2) and the spending limit (50 XLM per hour) are set in the same transaction that creates it, so nobody can set it up before you.",
  },
  {
    id: "fund",
    title: "Put 100 XLM in the treasury",
    why: "The treasury holds money like any account. Anyone can send it funds.",
  },
  {
    id: "propose",
    title: "Owner 1 proposes paying 10 XLM to Owner 2",
    why: "Nothing moves yet. A proposal records who, how much and until when, and counts as its proposer's approval.",
  },
  {
    id: "early",
    title: "Try to pay with only one approval",
    why: "One of two owners is not enough, so the treasury refuses. This is the rule that protects the funds.",
  },
  {
    id: "approve",
    title: "Owner 2 approves",
    why: "A second owner agrees. Now the proposal has the approvals it needs.",
  },
  {
    id: "execute",
    title: "Execute the payment",
    why: "Two of two owners approved and 10 XLM is within the 50 XLM limit, so the treasury pays out.",
  },
  {
    id: "limit",
    title: "Try to propose 60 XLM",
    why: "Even with every owner's agreement, nothing above the spending limit can go out. The treasury refuses before anyone has to sign.",
  },
];

/** The part of the SDK client the demo uses, so tests can pass a fake. */
export interface DemoClient {
  contractId: string;
  propose(params: { asset: string; to: string; amount: bigint; ttlSeconds?: number }): Promise<{ hash: string; value: bigint }>;
  approve(id: bigint): Promise<{ hash: string }>;
  execute(id: bigint): Promise<{ hash: string }>;
  getSpent(asset: string): Promise<bigint>;
  listProposals(): Promise<Proposal[]>;
}

export interface DemoDeps {
  fundAccount(address: string): Promise<void>;
  /** Upload the contract and return its hash. Not called when a hash is already known. */
  uploadWasm(source: Keypair): Promise<string>;
  createTreasury(args: {
    wasmHash: string;
    signer: Signer;
    owners: string[];
    threshold: number;
    limits: LimitInit[];
  }): Promise<DemoClient>;
  fundTreasury(from: Keypair, treasuryId: string, amount: bigint): Promise<void>;
  clientFor(treasuryId: string, signer: Signer): DemoClient;
  /** Hash of an already uploaded contract, if the app is configured with one. */
  knownWasmHash?: string;
  asset: string;
  explorer: string;
}

export interface DemoResult {
  treasuryId: string;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const xlm = (n: bigint) => `${Number(n) / Number(XLM)} XLM`;

/**
 * Run the whole demo, reporting each step as it goes. Throws if a step fails.
 * Steps that are meant to be refused count as done only if the treasury really refuses them.
 */
export async function runDemo(
  deps: DemoDeps,
  onUpdate: (steps: DemoStep[]) => void,
): Promise<DemoResult> {
  const steps: DemoStep[] = STEP_DEFINITIONS.map((s) => ({ ...s, status: "waiting" }));
  const emit = () => onUpdate(steps.map((s) => ({ ...s })));
  const find = (id: string) => steps.find((s) => s.id === id)!;
  emit();

  async function step<T>(id: string, work: (s: DemoStep) => Promise<T>): Promise<T> {
    const s = find(id);
    s.status = "running";
    emit();
    try {
      const result = await work(s);
      if (s.status === "running") s.status = "done";
      emit();
      return result;
    } catch (error) {
      s.status = "failed";
      s.detail = error instanceof Error ? error.message : String(error);
      emit();
      throw error;
    }
  }

  /** Run something that must be refused with a given error. */
  async function expectRefusal(s: DemoStep, work: () => Promise<unknown>, kind: new () => Error) {
    try {
      await work();
    } catch (error) {
      if (error instanceof kind) {
        s.status = "refused";
        s.detail = `Refused, as it should be: ${error.message}`;
        return;
      }
      throw error;
    }
    throw new Error("The treasury accepted something it should have refused.");
  }

  const owner1 = Keypair.random();
  const owner2 = Keypair.random();
  const signer1 = keypairSigner(owner1);
  const signer2 = keypairSigner(owner2);

  await step("owners", async (s) => {
    await Promise.all([deps.fundAccount(owner1.publicKey()), deps.fundAccount(owner2.publicKey())]);
    s.detail = `Owner 1 ${short(owner1.publicKey())}, Owner 2 ${short(owner2.publicKey())}`;
  });

  const wasmHash = await step("upload", async (s) => {
    if (deps.knownWasmHash) {
      s.detail = `Already on the network. Code hash ${short(deps.knownWasmHash)}.`;
      return deps.knownWasmHash;
    }
    const hash = await deps.uploadWasm(owner1);
    s.detail = `Code hash ${short(hash)}.`;
    return hash;
  });

  const treasury = await step("create", async (s) => {
    const client = await deps.createTreasury({
      wasmHash,
      signer: signer1,
      owners: [owner1.publicKey(), owner2.publicKey()],
      threshold: 2,
      limits: [{ asset: deps.asset, limit: LIMIT, periodSeconds: PERIOD_SECONDS }],
    });
    s.detail = `Treasury ${short(client.contractId)}: 2 owners, 2 approvals needed, limit ${xlm(LIMIT)} per hour.`;
    s.link = { href: `${deps.explorer}/contract/${client.contractId}`, label: "View on Stellar Expert" };
    return client;
  });

  await step("fund", async (s) => {
    await deps.fundTreasury(owner1, treasury.contractId, 100n * XLM);
    s.detail = "The treasury now holds 100 XLM.";
  });

  const as1 = deps.clientFor(treasury.contractId, signer1);
  const as2 = deps.clientFor(treasury.contractId, signer2);

  const proposalId = await step("propose", async (s) => {
    const { hash, value } = await as1.propose({
      asset: deps.asset,
      to: owner2.publicKey(),
      amount: 10n * XLM,
      ttlSeconds: 3600,
    });
    s.detail = `Proposal #${value}: pay ${xlm(10n * XLM)} to Owner 2. Approvals: 1 of 2.`;
    s.link = { href: `${deps.explorer}/tx/${hash}`, label: "View transaction" };
    return value;
  });

  await step("early", (s) => expectRefusal(s, () => as1.execute(proposalId), NotEnoughApprovalsError));

  await step("approve", async (s) => {
    const { hash } = await as2.approve(proposalId);
    s.detail = "Approvals: 2 of 2.";
    s.link = { href: `${deps.explorer}/tx/${hash}`, label: "View transaction" };
  });

  await step("execute", async (s) => {
    const { hash } = await as1.execute(proposalId);
    const spent = await as1.getSpent(deps.asset);
    s.detail = `Paid. ${xlm(spent)} spent so far this hour, out of the ${xlm(LIMIT)} limit.`;
    s.link = { href: `${deps.explorer}/tx/${hash}`, label: "View transaction" };
  });

  await step("limit", (s) =>
    expectRefusal(
      s,
      () => as1.propose({ asset: deps.asset, to: owner2.publicKey(), amount: 60n * XLM }),
      OverLimitError,
    ),
  );

  return { treasuryId: treasury.contractId };
}

// ---- The real thing, against testnet

export const DEMO_AVAILABLE = config.networkPassphrase.includes("Test");

async function sendTransaction(server: rpc.Server, source: Keypair, operation: ReturnType<typeof Operation.uploadContractWasm>) {
  const account = await server.getAccount(source.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(operation)
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(source);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error("The network rejected the transaction.");
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== "SUCCESS") throw new Error(`The transaction ended as ${done.status}.`);
  return done;
}

/** Dependencies that talk to the real testnet. */
export function liveDeps(): DemoDeps {
  const server = new rpc.Server(config.rpcUrl);
  const client = (contractId: string, signer: Signer): DemoClient =>
    new TreasuryClient({
      contractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase,
      signer,
    }) as unknown as DemoClient;

  return {
    asset: nativeAssetId(),
    explorer: "https://stellar.expert/explorer/testnet",
    knownWasmHash: config.wasmHash || undefined,

    async fundAccount(address) {
      const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error("The testnet faucet did not fund the account. Try again in a moment.");
    },

    async uploadWasm(source) {
      const res = await fetch("/demo/treasury_contract.wasm");
      if (!res.ok) throw new Error("Could not load the contract file.");
      const wasm = new Uint8Array(await res.arrayBuffer());
      const done = await sendTransaction(server, source, Operation.uploadContractWasm({ wasm: wasm as unknown as Buffer }));
      if (!done.returnValue) throw new Error("The upload returned no hash.");
      const hash = scValToNative(done.returnValue) as Uint8Array;
      return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
    },

    async createTreasury(args) {
      return (await TreasuryClient.create({
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        ...args,
      })) as unknown as DemoClient;
    },

    async fundTreasury(from, treasuryId, amount) {
      const call = new Contract(nativeAssetId()).call(
        "transfer",
        new Address(from.publicKey()).toScVal(),
        new Address(treasuryId).toScVal(),
        nativeToScVal(amount, { type: "i128" }),
      );
      await sendTransaction(server, from, call as never);
    },

    clientFor: client,
  };
}
