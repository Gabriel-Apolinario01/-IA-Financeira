import FinanceApp from "@/components/finance-app";

export const dynamic = "force-dynamic";

export default function Page() {
  const documentVision = process.env.DOCUMENT_VISION_ENABLED === 'true' && Boolean(process.env.GROQ_API_KEY && process.env.GROQ_VISION_MODEL && process.env.GROQ_VISION_MODEL !== 'openai/gpt-oss-20b');
  return <FinanceApp documentVision={documentVision} provider={process.env.AI_PROVIDER === "groq" ? "Groq" : "OpenAI"} />;
}
