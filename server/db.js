import pkg from "pg";
const { Client } = pkg;

/*
  This is a serverless-safe DB connector
  Every request:
  connect -> query -> disconnect

  Prevents:
  - Render sleep crashes
  - Supabase pool exhaustion
  - Random hanging APIs
*/

export async function query(sql, params = []) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();

    const result = await client.query(sql, params);

    return result.rows;

  } catch (err) {
    console.error("DB QUERY ERROR:", err);
    throw err;

  } finally {
    // 🔥 MOST IMPORTANT LINE
    await client.end();
  }
}
