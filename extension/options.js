const NATIVE_HOST = "com.comandatech.print_host";

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, ok = true) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
}

async function nativeSend(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, msg, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function loadPrinters() {
  const res = await nativeSend({ action: "list_printers" });
  if (!res?.ok) throw new Error(res?.error || "Falha ao listar impressoras");
  const sel = $("fallbackPrinter");
  sel.innerHTML = "";
  for (const name of res.printers) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  if (res.default) sel.value = res.default;
  return res.printers;
}

async function loadStations() {
  const url = $("supabaseUrl").value.trim();
  const companyId = $("companyId").value.trim();
  if (!url || !companyId) return [];

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/print_stations?company_id=eq.${companyId}&active=eq.true&order=display_order.asc`;
  const key = (await chrome.storage.local.get("supabaseAnonKey")).supabaseAnonKey
    || $("supabaseKey")?.value?.trim()
    || "";
  const headers = { apikey: key || "", Authorization: `Bearer ${key || ""}` };
  const res = await fetch(endpoint, { headers });
  if (!res.ok) throw new Error("Erro ao buscar estações: " + res.status);
  return res.json();
}

function renderStations(stations, map, printers) {
  const root = $("stations");
  root.innerHTML = "";
  for (const st of stations) {
    const div = document.createElement("div");
    div.className = "station";
    div.innerHTML = `<strong>${st.name}</strong>`;
    const sel = document.createElement("select");
    sel.dataset.stationId = st.id;
    for (const p of printers) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    }
    if (map.station_printers?.[st.id]) sel.value = map.station_printers[st.id];
    div.appendChild(sel);
    root.appendChild(div);
  }
}

async function init() {
  const stored = await chrome.storage.local.get([
    "supabaseUrl",
    "companyId",
    "supabaseAnonKey",
    "printerMap",
  ]);
  if (stored.supabaseUrl) $("supabaseUrl").value = stored.supabaseUrl;
  if (stored.companyId) $("companyId").value = stored.companyId;
  if (stored.supabaseAnonKey && $("supabaseKey")) $("supabaseKey").value = stored.supabaseAnonKey;

  try {
    const printers = await loadPrinters();
    const stations = await loadStations();
    renderStations(stations, stored.printerMap || {}, printers);
    if (stored.printerMap?.fallback_printer) {
      $("fallbackPrinter").value = stored.printerMap.fallback_printer;
    }
    setStatus("Host nativo conectado. " + printers.length + " impressora(s).");
  } catch (e) {
    setStatus(String(e.message), false);
  }
}

$("saveBtn").addEventListener("click", async () => {
  try {
    const station_printers = {};
    document.querySelectorAll("#stations select").forEach((sel) => {
      station_printers[sel.dataset.stationId] = sel.value;
    });
    const map = {
      company_id: $("companyId").value.trim(),
      supabase_url: $("supabaseUrl").value.trim(),
      station_printers,
      fallback_printer: $("fallbackPrinter").value,
      host_version: "1.0.0",
    };
    const res = await nativeSend({ action: "save_map", map });
    if (!res?.ok) throw new Error(res?.error || "Falha ao salvar");
    await chrome.storage.local.set({
      supabaseUrl: map.supabase_url,
      companyId: map.company_id,
      supabaseAnonKey: $("supabaseKey")?.value?.trim() || "",
      printerMap: map,
    });
    setStatus("Mapa salvo em " + res.path);
  } catch (e) {
    setStatus(String(e.message), false);
  }
});

$("testBtn").addEventListener("click", async () => {
  try {
    const res = await nativeSend({ action: "test_print", printer: $("fallbackPrinter").value });
    if (!res?.ok) throw new Error(res?.error || "Falha no teste");
    setStatus("Teste enviado para a impressora.");
  } catch (e) {
    setStatus(String(e.message), false);
  }
});

void init();
