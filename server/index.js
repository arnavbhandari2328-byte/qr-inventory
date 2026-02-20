import express from "express";
import cors from "cors";
import { pool, testConnection } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.send("QR Inventory API Running");
});

/* =========================================================
   PRODUCTS
========================================================= */

/* ---------------- GET ALL PRODUCTS ---------------- */
app.get("/api/products", async (req, res) => {
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

    res.json(result.rows);
  } catch (err) {
    console.error("FETCH PRODUCTS ERROR:", err);
    res.status(500).json({
      error: "Database failed",
      details: err.message,
    });
  }
});

/* ---------------- GET SINGLE PRODUCT ---------------- */
app.get("/api/products/:pid", async (req, res) => {
  try {
    const { pid } = req.params;

    const result = await pool.query(
      `SELECT * FROM products WHERE product_id = $1`,
      [pid]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("FETCH ONE ERROR:", err);
    res.status(500).json({ error: "Database failed" });
  }
});

/* ---------------- ADD PRODUCT ---------------- */
app.post("/api/products", async (req, res) => {
  try {
    const { product_id, product_name, low_stock_alert } = req.body;

    const result = await pool.query(
      `INSERT INTO products (product_id, product_name, low_stock_alert)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [product_id, product_name, low_stock_alert]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("ADD ERROR:", err);
    res.status(500).json({ error: "Insert failed" });
  }
});

/* ---------------- DELETE PRODUCT ---------------- */
app.delete("/api/products/:pid", async (req, res) => {
  try {
    await pool.query(`DELETE FROM products WHERE product_id = $1`, [
      req.params.pid,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});


/* =========================================================
   TRANSACTIONS  (ADDED — REQUIRED BY FRONTEND)
========================================================= */

/* GET ALL TRANSACTIONS */
/* GET ALL TRANSACTIONS */
app.get("/api/transactions", async (req, res) => {
  try {
    // We added a LEFT JOIN here to grab the location name and attach it as 'location_name'
    const result = await pool.query(`
      SELECT t.*, l.name AS location_name
      FROM transactions t
      LEFT JOIN locations l ON t.location_id = l.id
      ORDER BY t.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("FETCH TRANSACTIONS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/* ADD TRANSACTION */
app.post("/api/transactions", async (req, res) => {
  try {
    const { product_id, type, quantity } = req.body;

    const result = await pool.query(
      `INSERT INTO transactions (product_id, type, quantity)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [product_id, type, quantity]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("ADD TRANSACTION ERROR:", err);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});


/* =========================================================
   LOCATIONS  (ADDED — REQUIRED BY FRONTEND)
========================================================= */

app.get("/api/locations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM locations
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("FETCH LOCATIONS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});


/* ---------------- START SERVER ---------------- */
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await testConnection();
});