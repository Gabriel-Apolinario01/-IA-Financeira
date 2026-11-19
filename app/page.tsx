import FinanceApp from "@/components/finance-app";

export const dynamic = "force-dynamic";

export default function Page() {
  return <FinanceApp provider={process.env.AI_PROVIDER === "groq" ? "Groq" : "OpenAI"} />;
}
