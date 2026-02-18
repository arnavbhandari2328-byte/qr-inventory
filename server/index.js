import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

const app = express();

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors());
app.use(express.json());

/* ---------------- DATABASE (SUPABASE SAFE) ---------------- */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* Test DB on boot */
pool.connect()
  .then(() => console.log("✅ Connected to Supabase"))
  .catch(err => console.error("❌ DB CONNECTION FAILED:", err.message));

/* ---------------- ROUTER ---------------- */

const router = express.Router();

router.get("/", (req, res) => {
  res.send("API Running");
});

/* PRODUCTS */
router.get("/products", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, product_id, product_name, low_stock_alert, created_at
      FROM products
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("PRODUCT FETCH ERROR:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/* LOCATIONS */
router.get("/locations", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM locations ORDER BY name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

/* TRANSACTIONS */
router.get("/transactions", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        t.*,
        l.name AS location_name
      FROM transactions t
      LEFT JOIN locations l ON t.location_id = l.id
      ORDER BY t.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Transaction error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/* INSERT TRANSACTION */
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
    console.error("Insert transaction error:", err);
    res.status(500).json({ error: "Insert failed" });
  }
});

app.use("/api", router);

/* HEALTH CHECK FOR RENDER */
app.get("/", (req, res) => res.send("Server Alive"));

/* PORT */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));
