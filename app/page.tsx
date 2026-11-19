import FinanceApp from "@/components/finance-app";
import { visionConfigured, privateVisionConfig } from '@/lib/document-vision-config';

export const dynamic = "force-dynamic";

export default function Page() {
  const documentVision = visionConfigured(privateVisionConfig());
  return <FinanceApp documentVision={documentVision} provider={process.env.AI_PROVIDER === "groq" ? "Groq" : "OpenAI"} />;
}
