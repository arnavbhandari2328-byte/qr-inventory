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

/* ---------------- DELETE ---------------- */
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

/* ---------------- START SERVER ---------------- */
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await testConnection();
});
