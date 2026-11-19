export function aiConfig() {
  const groq = process.env.AI_PROVIDER === 'groq';
  return {
    provider: groq ? 'groq' as const : 'openai' as const,
    key: groq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY,
    model: groq ? process.env.GROQ_MODEL : process.env.OPENAI_MODEL,
    enabled: process.env.AI_ENABLED,
  };
}
