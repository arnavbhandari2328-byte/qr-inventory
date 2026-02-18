app.get("/", (req, res) => {
  res.send("QR Inventory API is running");
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { query } from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= API ROUTER ================= */

const router = express.Router();

router.get("/", (req, res) => {
  res.send("API Running");
});

/* ---------------- PRODUCTS ---------------- */

router.get("/products", async (req, res) => {
  try {
    const rows = await query(`
      SELECT id, product_id, product_name, low_stock_alert, created_at
      FROM products
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("PRODUCT FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- LOCATIONS ---------------- */

router.get("/locations", async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM locations ORDER BY name`);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

router.post("/locations", async (req, res) => {
  try {
    const { name } = req.body;

    const rows = await query(
      `INSERT INTO locations (name) VALUES ($1) RETURNING *`,
      [name]
    );

    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to add location" });
  }
});

/* ---------------- TRANSACTIONS ---------------- */

router.get("/transactions", async (req, res) => {
  try {
    const rows = await query(`
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

    res.json(rows);
  } catch (err) {
    console.error("Transactions fetch error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

router.post("/transactions", async (req, res) => {
  try {
    const { product_id, location_id, transaction_type, quantity, party } = req.body;

    await query(
      `INSERT INTO transactions(product_id, location_id, transaction_type, quantity, party)
       VALUES ($1,$2,$3,$4,$5)`,
      [product_id, location_id, transaction_type, quantity, party]
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

/* IMPORTANT — PREFIX */
app.use("/api", router);

/* START SERVER */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
