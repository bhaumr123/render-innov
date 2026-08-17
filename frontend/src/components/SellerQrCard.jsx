import React, { useState } from "react";
import { BACKEND_URL } from "@/lib/api";
import { QrCode, X } from "lucide-react";

// Uploaded files are returned as a relative "/uploads/.." path when Cloudinary
// isn't configured; resolve those against the API's own origin. Cloudinary
// URLs are already absolute and pass through unchanged.
const resolveUrl = (path) => (path && path.startsWith("/") ? `${BACKEND_URL}${path}` : path);

export default function SellerQrCard({ qrUrl, title = "Scan & pay via UPI", subtitle, testId = "seller-qr-card" }) {
  const [open, setOpen] = useState(false);
  if (!qrUrl) return null;
  const src = resolveUrl(qrUrl);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className="w-full flex items-center gap-3 border border-warm rounded-lg p-3 bg-cream/40 hover:border-terracotta transition-colors text-left"
      >
        <img src={src} alt="Seller payment QR code" className="w-16 h-16 object-contain bg-white rounded border border-warm shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <QrCode size={14} className="text-sage shrink-0" /> <span className="line-clamp-1">{title}</span>
          </div>
          {subtitle && <div className="text-xs text-muted-warm line-clamp-1">{subtitle}</div>}
          <div className="text-[11px] text-terracotta mt-0.5">Tap to enlarge</div>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          data-testid={`${testId}-modal`}
        >
          <div className="bg-white rounded-lg p-6 max-w-xs w-full text-center relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-2 right-2 text-muted-warm hover:text-ink p-1"
            >
              <X size={18} />
            </button>
            <img src={src} alt="Seller payment QR code" className="w-full aspect-square object-contain" />
            <div className="text-sm text-ink mt-3 font-medium">Scan with any UPI app to pay</div>
            {subtitle && <div className="text-xs text-muted-warm mt-1">{subtitle}</div>}
          </div>
        </div>
      )}
    </>
  );
}
