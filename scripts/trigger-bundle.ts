const baseUrl = "https://iwmrtxdzlkasuzutxvhh.supabase.co/functions/v1/export-login-bundle";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bXJ0eGR6bGthc3V6dXR4dmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3OTExODMsImV4cCI6MjA4MDM2NzE4M30.VsnT1zdVUwJdv8gBlg8CthBx_bccZp-LsOs2PRq1Uik";

try {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
      "x-direct-run": "true"
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`HTTP error! status: ${response.status}, body: ${text}`);
    process.exit(1);
  }
  
  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
} catch (error) {
  console.error("Fetch error:", error);
  process.exit(1);
}
