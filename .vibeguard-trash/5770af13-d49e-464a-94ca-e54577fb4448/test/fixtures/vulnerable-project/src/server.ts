import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Apply security headers middleware
const app = express();
app.use(helmet());

// Apply rate limiting middleware to prevent DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per window
});
app.use(limiter);

// Configure CORS with explicit origin from environment variable
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://example.com'; // Set actual allowed origin
app.use(cors({ origin: allowedOrigin }));

export function startServer() {
  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
}

export function unusedHelper() {
  // This function is never imported anywhere - dead code
  return 'I am unused';
}

export function anotherUnusedExport() {
  // Also dead code
  return 42;
}
