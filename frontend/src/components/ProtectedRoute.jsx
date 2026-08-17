import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children, adminOnly = false, sellerOnly = false }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null) {
    return (
      <div data-testid="protected-loading" className="min-h-[40vh] flex items-center justify-center text-neutral-600">
        Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  if (sellerOnly && user.role !== "seller" && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}
