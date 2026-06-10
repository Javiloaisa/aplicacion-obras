import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initOfflineQueue } from "./lib/offline-queue";
import "./index.css";

initOfflineQueue();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
