import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- DATABASE ---------------- */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log("Database connected"))
  .catch(err => console.log("DB Error:", err.message));

/* ---------------- TEST ROUTE ---------------- */

app.get("/", (req, res) => {
  res.send("API Running");
});

/* ---------------- GET PRODUCTS ---------------- */

app.get("/products", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        product_id,
        product_name,
        low_stock_alert,
        created_at
      FROM products
      ORDER BY created_at DESC
    `);

    console.log("Products fetched:", result.rows.length);
    res.json(result.rows);

  } catch (err) {
    console.error("PRODUCT FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// ================= LOCATIONS =================

// GET all locations
app.get("/locations", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM locations ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

// ADD location (optional but useful)
app.post("/locations", async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      "INSERT INTO locations (name) VALUES ($1) RETURNING *",
      [name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add location" });
  }
});


/* ---------------- GET TRANSACTIONS ---------------- */

app.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.id,
        t.product_id,
        t.location_id,
        t.transaction_type,
        t.quantity,
        t.created_at,
        l.name AS location_name
      FROM transactions t
      LEFT JOIN locations l ON t.location_id = l.id
      ORDER BY t.id DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Transactions fetch error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});


/* ---------------- ADD TRANSACTION ---------------- */

app.post("/transactions", async (req, res) => {
  const { product_id, location_id, transaction_type, quantity, party } = req.body;

  await pool.query(
    `INSERT INTO transactions(product_id, location_id, transaction_type, quantity, party)
     VALUES ($1,$2,$3,$4,$5)`,
    [product_id, location_id, transaction_type, quantity, party]
  );

  res.json({ success: true });
});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

