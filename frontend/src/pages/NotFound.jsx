import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <h1 className="font-heading text-3xl font-bold">Page not found</h1>
      <p className="text-sm text-neutral-600 mt-2">The page you're looking for doesn't exist.</p>
      <Link to="/" className="link-blue hover:underline text-sm mt-4 inline-block">Go to homepage →</Link>
    </div>
  );
}
