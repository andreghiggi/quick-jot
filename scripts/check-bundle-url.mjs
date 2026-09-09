const res = await fetch('https://app.comandatech.com.br/');
const html = await res.text();
const m = html.match(/\/assets\/(index-[^"]+\.js)/);
const js = await (await fetch(`https://app.comandatech.com.br/assets/${m[1]}`)).text();
const patterns = [
  /https:\/\/api\.comandatech\.com\.br/g,
  /iwmrtxdzlkasuzutxvhh/g,
  /createClient\([^)]{0,200}/g,
  /VITE_SUPABASE_URL[^,]{0,80}/g,
  /"undefined"/g,
];
for (const p of patterns) {
  const hits = js.match(p) || [];
  console.log(p.source, hits.length, hits.slice(0, 2));
}
