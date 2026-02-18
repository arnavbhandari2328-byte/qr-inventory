import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool, testConnection } from "./db.js";

dotenv.config();

const app = express();

// Render runs behind proxy
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("QR Inventory Backend Running");
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(500).json({ status: "db_down" });
  }
});

/* ---------------- PRODUCTS ---------------- */

app.get("/products", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/products", async (req, res) => {
  try {
    const { name, size, quantity } = req.body;

    const result = await pool.query(
      `INSERT INTO products(name, size, quantity)
       VALUES($1,$2,$3)
       RETURNING *`,
      [name, size, quantity]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Insert failed" });
  }
});

/* ---------------- MOVEMENT ---------------- */

app.post("/movement", async (req, res) => {
  try {
    const { product_id, type, qty } = req.body;

    await pool.query("BEGIN");

    if (type === "IN") {
      await pool.query(
        "UPDATE products SET quantity = quantity + $1 WHERE id = $2",
        [qty, product_id]
      );
    } else {
      await pool.query(
        "UPDATE products SET quantity = quantity - $1 WHERE id = $2",
        [qty, product_id]
      );
    }

    await pool.query(
      `INSERT INTO movements(product_id,type,qty)
       VALUES($1,$2,$3)`,
      [product_id, type, qty]
    );

    await pool.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Movement failed" });
  }
});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await testConnection();
});
