"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { config, treasuryHref } from "@/lib/config";

const OLD_TREASURY_LINK = /^\/treasury\/(C[A-Z2-7]{55})\/?$/;

export default function NotFound() {
  const [moving, setMoving] = useState(false);

  // Treasury links used to look like /treasury/C…; they are now /treasury/?id=C…
  useEffect(() => {
    const path = window.location.pathname.slice(config.basePath.length);
    const match = OLD_TREASURY_LINK.exec(path);
    if (match) {
      setMoving(true);
      window.location.replace(`${config.basePath}${treasuryHref(match[1]!)}`);
    }
  }, []);

  if (moving) return <p role="status">Opening the treasury…</p>;

  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link href="/">Back to your treasuries</Link>
      </p>
    </>
  );
}
