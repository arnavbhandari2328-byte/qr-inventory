import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 6543,
  user: "postgres.tybioqoldfdabbprtcz",
  password: "Test1234",   // <-- your DB password
  database: "postgres",
  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;
