"use client";

import { StrKey } from "@stellar/stellar-sdk";
import { useState } from "react";
import type { FormEvent } from "react";

/** Open a treasury that already exists by its contract id. */
export function OpenTreasuryForm({ onOpen }: { onOpen: (id: string, name: string) => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = id.trim();
    if (!StrKey.isValidContract(trimmed)) {
      setError("Enter a treasury contract id. It starts with C and is 56 characters long.");
      return;
    }
    setError(null);
    onOpen(trimmed, name.trim() || "Untitled treasury");
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="open-heading" className="card form">
      <h2 id="open-heading">Open an existing treasury</h2>
      <div className="field">
        <label htmlFor="open-id">Treasury contract id</label>
        <input
          id="open-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "open-id-error" : undefined}
        />
        {error ? (
          <p id="open-id-error" className="field-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="open-name">
          Name <span className="optional">(optional, only saved in this browser)</span>
        </label>
        <input id="open-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <button type="submit" className="button">
        Open treasury
      </button>
    </form>
  );
}
