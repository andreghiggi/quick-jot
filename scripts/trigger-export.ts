const functionUrl = "http://localhost:8080/functions/v1/export-login-bundle";
try {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-direct-run": "true"
    }
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("Error response:", response.status, text);
    process.exit(1);
  }
  const data = await response.json();
  console.log(JSON.stringify(data));
} catch (err) {
  console.error("Fetch error:", err);
  process.exit(1);
}
