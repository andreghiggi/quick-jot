console.log("comandatech functions main started");

const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      },
    });
  }

  if (VERIFY_JWT) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return Response.json({ msg: "Missing authorization header" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const service_name = url.pathname.split("/").filter(Boolean)[0];
  const blocked = new Set(["main", "export-migration"]);
  if (!service_name || blocked.has(service_name) || service_name.includes(".")) {
    return Response.json({ msg: `unknown function: ${service_name || "(empty)"}` }, { status: 404 });
  }

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${service_name}`,
      memoryLimitMb: 256,
      workerTimeoutMs: 150_000,
      noModuleCache: false,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(e);
    return Response.json({ msg: String(e) }, { status: 500 });
  }
});
