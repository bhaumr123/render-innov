import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// This is React's actual entry point: find the empty <div id="root"> from
// index.html, and hand it a whole component tree to render into. Everything
// on screen from here on is JSX, not hand-written HTML.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
