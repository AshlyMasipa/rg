import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { RoleProvider } from "./lib/role";
import { WorldProvider } from "./lib/store";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <RoleProvider>
        <WorldProvider>
          <App />
        </WorldProvider>
      </RoleProvider>
    </BrowserRouter>
  </StrictMode>,
);
