import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";

initSentry();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
