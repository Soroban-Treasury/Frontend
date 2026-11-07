"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusMessage } from "@/components/StatusMessage";
import { DEMO_AVAILABLE, STEP_DEFINITIONS, liveDeps, runDemo } from "@/lib/demo";
import type { DemoStep } from "@/lib/demo";
import { treasuryHref } from "@/lib/config";
import { saveTreasury } from "@/lib/storage";

const STATUS_TEXT: Record<DemoStep["status"], string> = {
  waiting: "Waiting",
  running: "Running…",
  done: "Done",
  refused: "Refused, as it should be",
  failed: "Failed",
};

const initialSteps = (): DemoStep[] => STEP_DEFINITIONS.map((s) => ({ ...s, status: "waiting" }));

export default function DemoPage() {
  const [steps, setSteps] = useState<DemoStep[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setRunning(true);
    setFinished(false);
    setError(null);
    setTreasuryId(null);
    setSteps(initialSteps());
    try {
      const result = await runDemo(liveDeps(), setSteps);
      saveTreasury({ id: result.treasuryId, name: "Demo treasury" });
      setTreasuryId(result.treasuryId);
      setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The demo stopped. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  const current = steps.find((s) => s.status === "running");

  return (
    <>
      <h1>Live demo</h1>
      <p className="lead">
        Watch a team treasury work on the Stellar test network. No wallet needed: the demo makes two throwaway owners
        and runs the whole flow for real. It takes about three minutes, because every step is a real transaction on the network.
      </p>

      {!DEMO_AVAILABLE ? (
        <StatusMessage kind="info">The demo only runs on the test network. This app is set to a different network.</StatusMessage>
      ) : (
        <p>
          <button type="button" className="button" onClick={start} disabled={running}>
            {running ? "Running…" : finished || error ? "Run it again" : "Run the demo"}
          </button>
        </p>
      )}

      {/* Announced to screen readers as the demo moves along. */}
      <p className="visually-hidden" role="status">
        {current ? `Now: ${current.title}` : finished ? "The demo finished." : ""}
      </p>

      <ol className="demo-steps" aria-label="Demo steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`card demo-step demo-${s.status}`}>
            <div className="proposal-head">
              <h2>
                <span className="demo-number">{i + 1}.</span> {s.title}
              </h2>
              <span className={`badge badge-${badgeFor(s.status)}`}>{STATUS_TEXT[s.status]}</span>
            </div>
            <p className="muted">{s.why}</p>
            {s.detail ? <p className="demo-detail">{s.detail}</p> : null}
            {s.link ? (
              <p>
                <a href={s.link.href} target="_blank" rel="noreferrer">
                  {s.link.label}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {error ? <StatusMessage kind="error">The demo stopped: {error}</StatusMessage> : null}

      {finished && treasuryId ? (
        <section className="card" aria-labelledby="demo-done">
          <h2 id="demo-done">That is the whole idea</h2>
          <p>
            Several owners share the money. Nothing moves without enough of them agreeing, and nothing above the limit
            moves at all. Everything you just saw is on the public test network.
          </p>
          <p>
            <Link href={treasuryHref(treasuryId)} className="button">
              Open this treasury
            </Link>
          </p>
        </section>
      ) : null}
    </>
  );
}

function badgeFor(status: DemoStep["status"]): string {
  if (status === "done" || status === "refused") return "executed";
  if (status === "running") return "ready";
  if (status === "failed") return "failed";
  return "expired";
}
