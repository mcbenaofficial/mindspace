import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import CaptureApp from "./CaptureApp";

// The tray's capture popover loads the same bundle with ?capture=1.
const isCaptureWindow = window.location.search.includes("capture=1");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isCaptureWindow ? <CaptureApp /> : <App />}
  </React.StrictMode>
);
