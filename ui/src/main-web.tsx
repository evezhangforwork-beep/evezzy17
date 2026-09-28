import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DrawApp } from "./DrawApp.js";
import { createWebClient } from "./web-client.js";
import "./styles/index.css";

// One committed theme: the deck is midnight indigo and gold, and so is the app.
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
const appRoot = createRoot(root);

async function renderApp(): Promise<void> {
  const client =
    import.meta.env.VITE_STATIC_DRAW === "true"
      ? (await import("./static-web-client.js")).createStaticWebClient()
      : createWebClient();

  appRoot.render(
    <StrictMode>
      <DrawApp client={client} />
    </StrictMode>,
  );
}

void renderApp();
