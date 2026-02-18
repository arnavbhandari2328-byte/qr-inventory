import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("✅ Connected to Supabase");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected DB error", err);
});

export default pool;
