import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

// Logo após uma publicação o navegador pode tentar buscar um trecho antigo do
// aplicativo que já não existe no servidor. Nesse caso recarregamos uma única
// vez para pegar a versão nova, em vez de deixar a tela em branco.
const PRELOAD_FLAG = "comandatech:preload-reload";
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(PRELOAD_FLAG)) return;
  sessionStorage.setItem(PRELOAD_FLAG, "1");
  window.location.reload();
});

// Mount application
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
