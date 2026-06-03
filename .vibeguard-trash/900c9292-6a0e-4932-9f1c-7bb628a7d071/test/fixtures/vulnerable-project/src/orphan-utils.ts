// Another dead file - no imports point here

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseJSON(str: string): unknown {
  return JSON.parse(str);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// VULNERABILITY: Hard-coded Firebase service account
const FIREBASE_CONFIG = {
  type: "service_account",
  project_id: "my-project",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg...",
  client_email: "firebase-admin@my-project.iam.gserviceaccount.com",
};

export function getFirebaseConfig() {
  return FIREBASE_CONFIG;
}
