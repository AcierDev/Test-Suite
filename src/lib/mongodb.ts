import { MongoClient, Db } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient | undefined;
let clientPromise: Promise<MongoClient> | undefined;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
    console.log("MongoDB: New connection promise created (development).");
  } else {
    console.log("MongoDB: Reusing existing connection promise (development).");
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
  console.log("MongoDB: New connection promise created (production).");
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise;

// Helper function to get the database instance
export async function getDb(): Promise<Db> {
  if (!clientPromise) {
    throw new Error("MongoDB client promise not initialized");
  }
  const client = await clientPromise;
  // Use a default database name or get it from the URI if needed
  // For simplicity, let's use a fixed name 'hardwareDashboard'
  // You might want to make this configurable via env var as well
  const dbName = process.env.MONGODB_DB_NAME || "Hardware-Testing";
  return client.db(dbName);
}
