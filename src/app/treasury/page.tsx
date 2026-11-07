import { Suspense } from "react";
import { TreasuryView } from "@/components/TreasuryView";

export default function TreasuryPage() {
  return (
    <Suspense fallback={<p role="status">Loading treasury…</p>}>
      <TreasuryView />
    </Suspense>
  );
}
