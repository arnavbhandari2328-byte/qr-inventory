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
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});


/* ================= API ROUTER ================= */

const router = express.Router();

/* TEST */
router.get("/", (req, res) => {
  res.send("API Running");
});

/* ---------------- PRODUCTS ---------------- */

router.get("/products", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, product_id, product_name, low_stock_alert, created_at
      FROM products
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("PRODUCT FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- LOCATIONS ---------------- */

router.get("/locations", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM locations ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

router.post("/locations", async (req, res) => {
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

/* ---------------- TRANSACTIONS ---------------- */

router.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.id,
        t.product_id,
        t.location_id,
        t.transaction_type,
        t.quantity,
        t.party,
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

router.post("/transactions", async (req, res) => {
  try {
    const { product_id, location_id, transaction_type, quantity, party } = req.body;

    await pool.query(
      `INSERT INTO transactions(product_id, location_id, transaction_type, quantity, party)
       VALUES ($1,$2,$3,$4,$5)`,
      [product_id, location_id, transaction_type, quantity, party]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Add transaction error:", err);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

/* IMPORTANT — THIS CREATES /api PREFIX */
app.use("/api", router);

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
