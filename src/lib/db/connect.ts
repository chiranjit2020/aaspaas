import { MongoClient, type Db } from "mongodb";

/**
 * Serverless-safe Mongo client singleton.
 *
 * Next.js API routes run as separate serverless functions, and in dev the module
 * graph gets hot-reloaded on every save. Both situations can spawn a new MongoClient
 * (and a new connection pool) per invocation if we're not careful, so we cache the
 * connecting promise on `globalThis` — surviving hot reloads in dev, and reused
 * across warm invocations of the same function in production.
 */

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? "aaspaas_dev";

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.",
  );
}

interface MongoGlobal {
  _mongoClientPromise?: Promise<MongoClient>;
}

const globalForMongo = globalThis as typeof globalThis & MongoGlobal;

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(MONGODB_URI as string, {
    maxPoolSize: 10,
  });
  return client.connect();
}

const clientPromise: Promise<MongoClient> =
  globalForMongo._mongoClientPromise ?? createClientPromise();

if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClientPromise = clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(MONGODB_DB_NAME);
}

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}
