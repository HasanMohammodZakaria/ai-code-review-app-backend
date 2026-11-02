import {
  completeWithFallback,
  configuredProviders,
} from "../services/llm/llm.manager";

async function main() {
  console.log("Providers with keys:", configuredProviders());

  const result = await completeWithFallback({
    messages: [
      { role: "system", content: "You are a concise code reviewer." },
      {
        role: "user",
        content: "Review: var x = 1; console.log(x)  (one sentence)",
      },
    ],
  });

  console.log(`Answered by ${result.provider} (${result.model}):`);
  console.log(result.text);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
