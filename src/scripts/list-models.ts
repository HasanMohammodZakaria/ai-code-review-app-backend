import { env } from "../config/env";

const targets = [
  {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    key: env.GEMINI_API_KEY,
  },
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/models",
    key: env.GROQ_API_KEY,
  },
];

async function main() {
  for (const t of targets) {
    if (!t.key) continue;
    const res = await fetch(t.url, {
      headers: { Authorization: `Bearer ${t.key}` },
    });
    console.log(`\n=== ${t.name}: HTTP ${res.status}`);
    if (!res.ok) {
      console.log((await res.text()).slice(0, 300));
      continue;
    }
    const json = (await res.json()) as { data?: { id: string }[] };
    console.log((json.data ?? []).map((m) => m.id).join("\n"));
  }
}

main();
