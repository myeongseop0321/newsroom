declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ELASTICSEARCH_URL?: string;
    ELASTICSEARCH_API_KEY?: string;
    ELASTICSEARCH_INDEX?: string;
    BUCKET?: R2Bucket;
  }
}
