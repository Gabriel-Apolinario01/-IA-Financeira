declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI_ENABLED?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  }
}
