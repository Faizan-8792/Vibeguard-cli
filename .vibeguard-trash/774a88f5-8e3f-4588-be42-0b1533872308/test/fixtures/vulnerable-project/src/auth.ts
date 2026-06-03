// VULNERABILITY: Hard-coded OpenAI API key
const OPENAI_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz123456789ABCDEF";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const jwt_secret = process.env.JWT_SECRET;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

export function setupAuth() {
  return {
    openai: OPENAI_KEY,
    anthropic: ANTHROPIC_KEY,
    aws: { access: AWS_ACCESS_KEY, secret: AWS_SECRET_KEY },
    jwt: JWT_SECRET,
    supabase: SUPABASE_KEY,
    google: GOOGLE_KEY,
  };
}

export function validateToken(token: string) {
  // Using environment variable secret
  return token === jwt_secret;
}