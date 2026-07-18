import React, { useState } from "react";

// Small utility that wraps an <img> with:
//  - a subtle skeleton placeholder while loading
//  - a graceful fade-in when loaded
//  - crisp scaling via `object-contain` by default
export default function SmartImage({ src, alt = "", className = "", objectFit = "contain", eager = false, ...rest }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-parchment/40 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-${objectFit} transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        {...rest}
      />
    </div>
  );
}
