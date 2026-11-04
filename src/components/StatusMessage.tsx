import type { ReactNode } from "react";

/**
 * A message that screen readers announce: errors interrupt (`alert`), the rest wait (`status`).
 * Keep the element on the page even when empty so changes are announced.
 */
export function StatusMessage({
  kind,
  children,
  id,
}: {
  kind: "info" | "success" | "error";
  children: ReactNode;
  id?: string;
}) {
  return (
    <p id={id} className={`message message-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
