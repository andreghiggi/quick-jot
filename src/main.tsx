import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

// Logo após uma publicação o navegador pode tentar buscar um trecho antigo do
// aplicativo que já não existe no servidor. Nesse caso recarregamos uma única
// vez para pegar a versão nova, em vez de deixar a tela em branco.
const PRELOAD_FLAG = "comandatech:preload-reload";
let preloadReloadedWithoutStorage = false;

function hasPreloadReloaded(): boolean {
  try {
    return sessionStorage.getItem(PRELOAD_FLAG) === "1";
  } catch {
    return preloadReloadedWithoutStorage;
  }
}

function markPreloadReload(): void {
  preloadReloadedWithoutStorage = true;
  try {
    sessionStorage.setItem(PRELOAD_FLAG, "1");
  } catch {
    // Alguns navegadores bloqueiam sessionStorage; a trava em memória evita repetição.
  }
}

async function clearTechnicalCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
  } catch (error) {
    console.warn("[app] não foi possível limpar o cache técnico", error);
  }
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (hasPreloadReloaded()) return;
  markPreloadReload();
  void clearTechnicalCaches().finally(() => window.location.reload());
});

// Mount application
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento principal do aplicativo não encontrado");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
