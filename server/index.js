import express from "express";
import cors from "cors";
import { pool, testConnection } from "./db.js";

const app = express();
const PORT = process.env.PORT || 10000;

/* -------------------- MIDDLEWARE -------------------- */

app.use(cors());
app.use(express.json());

/* -------------------- HEALTH CHECK -------------------- */

app.get("/", (req, res) => {
  res.send("QR Inventory API is running 🚀");
});

/* -------------------- GET ALL PRODUCTS -------------------- */

app.get("/api/products", async (req, res) => {
  try {
    console.log("📦 Fetching products...");

    const result = await pool.query(`
      SELECT 
        id,
        name,
        size,
        material,
        quantity,
        location,
        created_at
      FROM products
      ORDER BY id DESC
    `);

    console.log(`✅ Sent ${result.rows.length} products`);
    res.json(result.rows);

  } catch (err) {
    console.error("❌ PRODUCT FETCH ERROR:", err.message);
    res.status(500).json({
      error: "Database failed",
      details: err.message
    });
  }
});

/* -------------------- ADD PRODUCT -------------------- */

app.post("/api/products", async (req, res) => {
  try {
    const { name, size, material, quantity, location } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Product name required" });
    }

    const result = await pool.query(
      `INSERT INTO products (name, size, material, quantity, location)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [name, size, material, quantity || 0, location]
    );

    console.log("➕ Product added:", result.rows[0].name);
    res.json(result.rows[0]);

  } catch (err) {
    console.error("❌ ADD PRODUCT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- DELETE PRODUCT -------------------- */

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM products WHERE id = $1", [id]);

    console.log("🗑 Deleted product:", id);
    res.json({ success: true });

  } catch (err) {
    console.error("❌ DELETE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- START SERVER -------------------- */

async function startServer() {
  await testConnection();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

startServer();
