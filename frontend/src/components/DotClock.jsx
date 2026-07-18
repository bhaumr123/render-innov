import React, { useEffect, useState } from "react";

// Live HH:MM:SS + date in Nothing-style dot-matrix numerals.
// Small, quiet, blinks the colon like an old digital clock.
export default function DotClock({ className = "" }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);

  return (
    <span
      className={`font-dot inline-flex items-center gap-2 text-[11px] leading-none ${className}`}
      data-testid="header-dot-clock"
      aria-label="Current time"
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-terracotta dot-blink" />
      <span className="tabular-nums">
        {hh}<span className="dot-blink">:</span>{mm}<span className="opacity-60">:{ss}</span>
      </span>
      <span className="opacity-40">·</span>
      <span className="tabular-nums opacity-70">{dd}.{mo}.{yy}</span>
    </span>
  );
}
