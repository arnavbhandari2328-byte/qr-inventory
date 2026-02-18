import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

/* Test DB Connection */
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to Supabase PostgreSQL");
    client.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
}
