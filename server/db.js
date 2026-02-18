import pkg from "pg";
const { Pool } = pkg;

// Render + Supabase compatible connection
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL missing in environment variables");
  process.exit(1);
}

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // REQUIRED for Supabase
  },
  max: 5, // prevent Render memory kill
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection at startup
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to Supabase database");
    client.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
}
