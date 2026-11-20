export interface VisionConfig { model?: string; key?: string; enabled?: string }

// Supported image input and JSON mode: https://console.groq.com/docs/vision
export function visionConfigured(config: VisionConfig) {
  return config.enabled === 'true' && Boolean(config.key?.trim()) && config.model === 'qwen/qwen3.8-27b';
}

export function privateVisionConfig(): VisionConfig {
  return { key: process.env.GROQ_API_KEY, model: process.env.GROQ_VISION_MODEL, enabled: process.env.DOCUMENT_VISION_ENABLED };
}
