// Load Razorpay Checkout script on demand
let _loading = null;
export function loadRazorpay() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (_loading) return _loading;
  _loading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      _loading = null;
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return _loading;
}
