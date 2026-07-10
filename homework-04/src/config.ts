import dotenv from 'dotenv';

// In a container the configuration is injected as environment variables
// (via the ECS task definition / Secrets Manager). `dotenv` is only a
// convenience for local development where a `.env` file may be present.
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'production',
  /** Port the HTTP server binds to. TLS is terminated upstream (ALB). */
  port: Number(process.env.PORT ?? 8802),
  database: {
    url: required('DATABASE_URL'),
    name: required('DATABASE_NAME'),
  },
} as const;

export type Config = typeof config;
