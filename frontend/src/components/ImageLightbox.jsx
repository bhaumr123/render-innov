import React, { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";

export default function ImageLightbox({ src, alt = "", open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/95 hover:bg-terracotta hover:text-white text-ink flex items-center justify-center transition-colors"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[92vw] object-contain drop-shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function ZoomHint({ className = "" }) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-full bg-white/95 backdrop-blur border border-warm px-2.5 py-1 text-[10px] uppercase tracking-widest text-ink ${className}`}>
      <ZoomIn size={11} /> Zoom
    </div>
  );
}
