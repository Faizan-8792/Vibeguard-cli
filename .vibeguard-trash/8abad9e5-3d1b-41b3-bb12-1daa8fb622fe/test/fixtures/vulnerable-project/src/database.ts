// Database connection URLs from environment variables
const DATABASE_URL = process.env.DATABASE_URL || "";

// MongoDB connection from environment variable
const MONGO_URI = process.env.MONGO_URI || "";

export async function connectDB() {
  if (!DATABASE_URL || !MONGO_URI) {
    throw new Error("DATABASE_URL and MONGO_URI environment variables must be set");
  }
  // Using environment variables for credentials
  console.log('Connecting to:', DATABASE_URL);
  console.log('Mongo:', MONGO_URI);
  return { connected: true };
}

export function getConnectionString() {
  return DATABASE_URL;
}
