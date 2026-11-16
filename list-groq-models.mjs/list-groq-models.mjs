const res = await fetch("https://api.groq.com/openai/v1/models", {
  headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
});

console.log("Status:", res.status);
const data = await res.json();
if (!res.ok) console.log(JSON.stringify(data).slice(0, 300));
for (const m of data.data ?? []) console.log(m.id);