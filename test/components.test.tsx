import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Proposal } from "treasury-sdk";
import { validateCreate } from "@/components/CreateTreasuryForm";
import type { CreateValues } from "@/components/CreateTreasuryForm";
import { OpenTreasuryForm } from "@/components/OpenTreasuryForm";
import { ProposalForm, formatResetDate } from "@/components/ProposalForm";
import { ProposalList } from "@/components/ProposalList";

const alice = Keypair.random().publicKey();
const bob = Keypair.random().publicKey();
const carol = Keypair.random().publicKey();
const ASSET = StrKey.encodeContract(Buffer.alloc(32, 3));
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 4));

describe("validateCreate", () => {
  const good: CreateValues = {
    name: "Team",
    owners: `${alice}\n${bob}\n${carol}`,
    threshold: "2",
    asset: ASSET,
    limit: "100",
    periodDays: "7",
  };

  it("parses a good form", () => {
    const result = validateCreate(good);
    expect("params" in result && result.params).toMatchObject({
      name: "Team",
      owners: [alice, bob, carol],
      threshold: 2,
      asset: ASSET,
      limit: 1_000_000_000n,
      periodSeconds: 7 * 86400,
    });
  });

  it("accepts owners separated by commas or spaces and names the treasury if left blank", () => {
    const result = validateCreate({ ...good, name: "  ", owners: `${alice}, ${bob} ${carol}` });
    expect("params" in result && result.params.owners).toEqual([alice, bob, carol]);
    expect("params" in result && result.params.name).toBe("Untitled treasury");
  });

  it("reports each problem", () => {
    const result = validateCreate({
      name: "",
      owners: `${alice}\nnot-an-address`,
      threshold: "5",
      asset: "nope",
      limit: "0",
      periodDays: "0",
    });
    expect("errors" in result && Object.keys(result.errors).sort()).toEqual(
      ["asset", "limit", "owners", "periodDays", "threshold"].sort(),
    );
  });

  it("checks the threshold against the owners", () => {
    const tooMany = validateCreate({ ...good, threshold: "4" });
    expect("errors" in tooMany && tooMany.errors.threshold).toMatch(/more than the number of owners/);
    const zero = validateCreate({ ...good, threshold: "0" });
    expect("errors" in zero && zero.errors.threshold).toBeDefined();
    const fraction = validateCreate({ ...good, threshold: "1.5" });
    expect("errors" in fraction && fraction.errors.threshold).toBeDefined();
  });

  it("rejects duplicate and too many owners", () => {
    const dup = validateCreate({ ...good, owners: `${alice}\n${alice}`, threshold: "1" });
    expect("errors" in dup && dup.errors.owners).toMatch(/only be listed once/);
    const many = Array.from({ length: 11 }, () => Keypair.random().publicKey()).join("\n");
    const result = validateCreate({ ...good, owners: many, threshold: "2" });
    expect("errors" in result && result.errors.owners).toMatch(/at most 10/);
  });

  it("rejects an empty owner list", () => {
    const result = validateCreate({ ...good, owners: "  " });
    expect("errors" in result && result.errors.owners).toBe("Add at least one owner.");
  });
});

describe("OpenTreasuryForm", () => {
  it("opens a valid treasury id with a name", async () => {
    const onOpen = vi.fn();
    render(<OpenTreasuryForm onOpen={onOpen} />);
    await userEvent.type(screen.getByLabelText(/treasury contract id/i), `  ${CONTRACT} `);
    await userEvent.type(screen.getByLabelText(/^name/i), "DAO");
    await userEvent.click(screen.getByRole("button", { name: /open treasury/i }));
    expect(onOpen).toHaveBeenCalledWith(CONTRACT, "DAO");
  });

  it("explains a bad id and does not open", async () => {
    const onOpen = vi.fn();
    render(<OpenTreasuryForm onOpen={onOpen} />);
    await userEvent.type(screen.getByLabelText(/treasury contract id/i), "GABC");
    await userEvent.click(screen.getByRole("button", { name: /open treasury/i }));
    expect(onOpen).not.toHaveBeenCalled();
    const input = screen.getByLabelText(/treasury contract id/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/starts with C/i)).toBeInTheDocument();
  });
});

describe("ProposalForm", () => {
  const asset = { id: ASSET, label: "XLM", limit: 1_000_000_000n, remaining: 400_000_000n };

  async function fill(to: string, amount: string) {
    await userEvent.type(screen.getByLabelText(/send to/i), to);
    await userEvent.type(screen.getByLabelText(/^amount/i), amount);
    await userEvent.click(screen.getByRole("button", { name: /propose payment/i }));
  }

  it("submits parsed values", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ProposalForm assets={[asset]} canPropose onSubmit={onSubmit} />);
    await fill(bob, "12.5");
    expect(onSubmit).toHaveBeenCalledWith({ asset: ASSET, to: bob, amount: 125_000_000n, ttlSeconds: 7 * 86400 });
    expect(await screen.findByText(/proposal created/i)).toBeInTheDocument();
  });

  it("shows what is left to spend", () => {
    render(<ProposalForm assets={[asset]} canPropose onSubmit={async () => {}} />);
    expect(screen.getByText(/40 XLM left to spend/)).toBeInTheDocument();
  });

  it("rejects a bad address, a bad amount and an amount over the limit", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ProposalForm assets={[asset]} canPropose onSubmit={onSubmit} />);
    await fill("nope", "abc");
    expect(screen.getByText(/starts with G or C/i)).toBeInTheDocument();
    expect(screen.getByText(/numbers only/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/send to/i));
    await userEvent.clear(screen.getByLabelText(/^amount/i));
    await fill(bob, "101");
    expect(screen.getByText(/above the spending limit of 100 XLM/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the error from a failed send", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("The payment would exceed the spending limit for this period.");
    });
    render(<ProposalForm assets={[asset]} canPropose onSubmit={onSubmit} />);
    await fill(bob, "5");
    expect(await screen.findByRole("alert")).toHaveTextContent(/exceed the spending limit/);
  });

  it("is disabled for non-owners and says why", () => {
    render(<ProposalForm assets={[asset]} canPropose={false} reason="Only owners can propose." onSubmit={async () => {}} />);
    expect(screen.getByRole("button", { name: /propose payment/i })).toBeDisabled();
    expect(screen.getByText("Only owners can propose.")).toBeInTheDocument();
  });

  it("explains when no limits are set", () => {
    render(<ProposalForm assets={[]} canPropose onSubmit={async () => {}} />);
    expect(screen.getByText(/no spending limits/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /propose/i })).not.toBeInTheDocument();
  });

  describe("policy simulator", () => {
    const NOW = 1_800_000_000;
    const RESET_AT = NOW + 86_400;
    const policyAsset = {
      id: ASSET,
      label: "XLM",
      limit: 1_000_000_000n, // 100 XLM
      spent: 300_000_000n, // 30 XLM spent
      periodSeconds: 86_400n,
      resetsAt: RESET_AT,
    };
    const approvedUnpaidProposal: Proposal = {
      id: 1n,
      proposer: alice,
      asset: ASSET,
      to: carol,
      amount: 200_000_000n, // 20 XLM approved and waiting for execution
      approvals: [alice, bob],
      executed: false,
      expiresAt: BigInt(NOW + 7 * 86_400),
    };
    const unapprovedOpenProposal: Proposal = {
      id: 2n,
      proposer: alice,
      asset: ASSET,
      to: carol,
      amount: 150_000_000n, // only 1 of 2 approvals, does not count as approved yet
      approvals: [alice],
      executed: false,
      expiresAt: BigInt(NOW + 7 * 86_400),
    };

    it("shows limit, spent, approved unpaid total, remaining, reset date, and fits verdict when under the limit", async () => {
      render(
        <ProposalForm
          assets={[policyAsset]}
          proposals={[approvedUnpaidProposal, unapprovedOpenProposal]}
          threshold={2}
          nowSeconds={NOW}
          canPropose
          onSubmit={async () => {}}
        />,
      );

      // 100 limit - 30 spent - 20 approved unpaid = 50 XLM left.
      expect(screen.getByText(/50 XLM left to spend/)).toBeInTheDocument();
      expect(screen.getByText("30 XLM")).toBeInTheDocument();
      expect(screen.getByText("20 XLM")).toBeInTheDocument();
      expect(screen.getByText(formatResetDate(RESET_AT))).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(/^amount/i), "15");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Fits the spending limit: 35 XLM will remain after this payment.",
      );
    });

    it("announces fits with 0 remaining when the amount is exactly at what is left", async () => {
      render(
        <ProposalForm
          assets={[policyAsset]}
          proposals={[approvedUnpaidProposal]}
          threshold={2}
          nowSeconds={NOW}
          canPropose
          onSubmit={async () => {}}
        />,
      );

      await userEvent.type(screen.getByLabelText(/^amount/i), "50");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Fits the spending limit: uses all 50 XLM available (0 XLM remaining).",
      );
    });

    it("announces how much the draft is over what is left until the reset date", async () => {
      render(
        <ProposalForm
          assets={[policyAsset]}
          proposals={[approvedUnpaidProposal]}
          threshold={2}
          nowSeconds={NOW}
          canPropose
          onSubmit={async () => {}}
        />,
      );

      await userEvent.type(screen.getByLabelText(/^amount/i), "62.5");
      expect(screen.getByRole("status")).toHaveTextContent(
        `This is 12.5 XLM over what is left until ${formatResetDate(RESET_AT)}.`,
      );
    });

    it("treats a period that has already reset as having the full limit available again", async () => {
      const alreadyResetAsset = {
        id: ASSET,
        label: "XLM",
        limit: 1_000_000_000n, // 100 XLM
        spent: 900_000_000n, // 90 XLM from a window that already ended
        periodSeconds: 86_400n,
        periodStart: NOW - 90_000, // ended 3,600 seconds ago
      };
      render(
        <ProposalForm assets={[alreadyResetAsset]} nowSeconds={NOW} canPropose onSubmit={async () => {}} />,
      );

      expect(screen.getByText(/100 XLM left to spend/)).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/Previous spending period has reset/i);

      await userEvent.type(screen.getByLabelText(/^amount/i), "80");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Fits the spending limit: 20 XLM will remain after this payment.",
      );
    });

    it("announces when a selected asset has no spending limit and disables proposing", async () => {
      const ASSET_NO_LIMIT = StrKey.encodeContract(Buffer.alloc(32, 9));
      const onSubmit = vi.fn(async () => {});
      render(
        <ProposalForm
          assets={[
            { id: ASSET_NO_LIMIT, label: "USDC", limit: null },
            policyAsset,
          ]}
          nowSeconds={NOW}
          canPropose
          onSubmit={onSubmit}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "USDC has no spending limit, so it cannot be spent.",
      );
      expect(screen.getByRole("button", { name: /propose payment/i })).toBeDisabled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("surfaces SDK preview fee or contract failure when onPreview is provided", async () => {
      const onPreview = vi.fn(async () => ({ ok: true as const, fee: 54_100n }));
      render(
        <ProposalForm
          assets={[policyAsset]}
          nowSeconds={NOW}
          canPropose
          onPreview={onPreview}
          onSubmit={async () => {}}
        />,
      );

      await userEvent.type(screen.getByLabelText(/send to/i), bob);
      await userEvent.type(screen.getByLabelText(/^amount/i), "10");

      expect(await screen.findByText(/Estimated network fee: 0\.00541 XLM/)).toBeInTheDocument();
      expect(onPreview).toHaveBeenCalledWith({
        asset: ASSET,
        to: bob,
        amount: 100_000_000n,
        ttlSeconds: 7 * 86400,
      });
    });
  });
});

describe("ProposalList", () => {
  const proposal = (over: Partial<Proposal>): Proposal => ({
    id: 0n,
    proposer: alice,
    asset: ASSET,
    to: carol,
    amount: 50_000_000n,
    approvals: [alice],
    executed: false,
    expiresAt: 10_000n,
    ...over,
  });

  const render_ = (proposals: Proposal[], address: string | null, extra = {}) => {
    const onApprove = vi.fn();
    const onExecute = vi.fn();
    render(
      <ProposalList
        proposals={proposals}
        threshold={2}
        address={address}
        owners={[alice, bob, carol]}
        nowSeconds={1000}
        busyId={null}
        onApprove={onApprove}
        onExecute={onExecute}
        {...extra}
      />,
    );
    return { onApprove, onExecute };
  };

  it("lets an owner who has not approved approve", async () => {
    const { onApprove } = render_([proposal({ id: 3n })], bob);
    expect(screen.getByText("Needs approvals")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 needed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approve proposal 3" }));
    expect(onApprove).toHaveBeenCalledWith(3n);
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("shows execute once enough owners approved", async () => {
    const { onExecute } = render_([proposal({ id: 1n, approvals: [alice, bob] })], carol);
    expect(screen.getByText("Ready to execute")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Execute proposal 1" }));
    expect(onExecute).toHaveBeenCalledWith(1n);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("tells an owner who already approved to wait", () => {
    render_([proposal({})], alice);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/you approved this/i)).toBeInTheDocument();
    expect(screen.getByText(/Approved by: you/)).toBeInTheDocument();
  });

  it("offers no actions to someone who is not an owner or not connected", () => {
    render_([proposal({})], Keypair.random().publicKey());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/connect an owner/i)).toBeInTheDocument();
  });

  it("shows finished and expired proposals without actions", () => {
    render_([proposal({ id: 1n, executed: true }), proposal({ id: 2n, expiresAt: 500n })], bob);
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables buttons while one is being sent", () => {
    render_([proposal({ id: 3n })], bob, { busyId: 3n });
    expect(screen.getByRole("button", { name: "Approve proposal 3" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve proposal 3" })).toHaveTextContent("Approving…");
  });

  it("shows the empty text", () => {
    render_([], bob, { emptyText: "Nothing here." });
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });
});
