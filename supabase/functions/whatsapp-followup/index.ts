const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Follow-up de 30min foi descontinuado (redundante com a mensagem de Finalizado).
// Função mantida como no-op para preservar URL existente caso o cron ainda invoque.
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ message: "whatsapp-followup disabled", count: 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
