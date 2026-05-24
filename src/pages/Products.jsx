import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STORAGE_KEY = "productDisplayOrder";

const ADMIN_EMAILS = [
  "niveemetals@gmail.com",
  "vishalom999@gmail.com",
  "vikrambhandari7171@gmail.com",
];

// ─── Catalog grouping helpers ────────────────────────────────────────────────

function inferMaterial(productName) {
  const n = productName.toUpperCase();
  if (n.includes("316L")) return "SS 316L";
  if (n.includes("316")) return "SS 316";
  if (n.includes("304L")) return "SS 304L";
  if (n.includes("304")) return "SS 304";
  if (n.includes("202")) return "SS 202";
  if (n.includes("201")) return "SS 201";
  if (n.includes("310")) return "SS 310";
  if (n.includes("321")) return "SS 321";
  if (n.includes("409")) return "SS 409";
  if (n.includes("430")) return "SS 430";
  if (n.includes("MS") || n.includes("MILD STEEL")) return "MS";
  if (n.includes("GI") || n.includes("GALVANISED") || n.includes("GALVANIZED")) return "GI";
  if (n.includes("CARBON STEEL") || n.includes("CS")) return "Carbon Steel";
  return "Other";
}

function inferCategory(productName) {
  const n = productName.toUpperCase();

  if (n.includes("SEAMLESS")) return "Seamless";

  if (n.includes("SCH 160") || n.includes("SCH-160") || n.includes("SCH160")) return "SCH 160";
  if (n.includes("SCH 80")  || n.includes("SCH-80")  || n.includes("SCH80"))  return "SCH 80";
  if (n.includes("SCH 40")  || n.includes("SCH-40")  || n.includes("SCH40"))  return "SCH 40";
  if (n.includes("SCH 20")  || n.includes("SCH-20")  || n.includes("SCH20"))  return "SCH 20";
  if (n.includes("SCH 10")  || n.includes("SCH-10")  || n.includes("SCH10"))  return "SCH 10";
  if (n.includes("SCH 5")   || n.includes("SCH-5")   || n.includes("SCH05") || n.includes("SCH-05")) return "SCH 5";

  const swgMatch = n.match(/(\d+)\s*SWG/);
  if (swgMatch) return `SWG ${swgMatch[1]}`;

  if (n.includes("POLISH") || n.includes("POLISHED")) return "Polish Pipe";
  if (n.includes("SQUARE")) return "Square Rod";
  if (n.includes("RECTANGLE") || n.includes("RECTANGULAR") || n.includes("RECTANGE")) return "Rectangular Pipe";
  if (n.includes("ROUND BAR") || n.includes("ROUND ROD") || n.includes("BRIGHT ROD") || n.includes("BRIGHT BAR")) return "Round Bar";
  if (n.includes("FLAT BAR") || n.includes("FLAT ROD")) return "Flat Bar";
  if (n.includes("ANGLE")) return "Angle";
  if (n.includes("CHANNEL")) return "Channel";
  if (
    n.includes("SHEET") || n.includes("PLATE") ||
    n.includes(" MAT ") || n.includes(" MAT$") || n.endsWith(" MAT") ||
    n.includes("NO.4") || n.includes("NO.2") || n.includes("NO.8") ||
    n.includes("2B FINISH") || n.includes("BA FINISH") || n.includes("HAIRLINE")
  ) return "Sheet / Plate";
  if (n.includes("COIL") || n.includes("STRIP")) return "Coil / Strip";
  if (n.includes("ERW")) return "ERW";
  if (n.includes("PIPE")) return "Pipe (General)";
  return "General";
}

function buildCatalog(products) {
  const catalog = {};
  products.forEach(p => {
    const mat = inferMaterial(p.product_name);
    const cat = inferCategory(p.product_name);
    if (!catalog[mat]) catalog[mat] = {};
    if (!catalog[mat][cat]) catalog[mat][cat] = [];
    catalog[mat][cat].push(p);
  });
  return catalog;
}

// ─── Inch fraction lookup table ───────────────────────────────────────────────
// Product names use inch notation like: 1/4", 1/2", 3/4", 1", 11/4", 11/2", 2", etc.
// "11/4" means 1+1/4 = 1.25, "11/2" means 1+1/2 = 1.5, "21/2" means 2+1/2 = 2.5
// Standard pipe NB sizes in inches for reference:
//   1/8" → 0.125,  1/4" → 0.25,  3/8" → 0.375,  1/2" → 0.5,  3/4" → 0.75
//   1" → 1,  11/4" → 1.25,  11/2" → 1.5,  2" → 2,  21/2" → 2.5
//   3" → 3,  4" → 4,  5" → 5,  6" → 6,  8" → 8,  10" → 10,  12" → 12

// Converts a raw string like "11/2", "1/4", "3/4", "21/2" to a decimal inch value.
function parseInchFraction(raw) {
  // Pattern: optional whole part + fraction  e.g. "11/2" -> whole=1, num=1, den=2
  //          or pure fraction                e.g. "1/2"  -> whole=0, num=1, den=2
  //          or whole only                   e.g. "6"    -> 6
  const withFraction = raw.match(/^(\d*)(\d)\/( \d+)$/);
  // Better: split at the slash
  if (raw.includes("/")) {
    const slashIdx = raw.indexOf("/");
    const denomStr = raw.slice(slashIdx + 1);          // e.g. "2"
    const numerStr = raw.slice(slashIdx - 1, slashIdx); // last digit before slash = numerator
    const wholeStr = raw.slice(0, slashIdx - 1);        // everything before that digit
    const whole = wholeStr ? parseInt(wholeStr, 10) : 0;
    const numer = parseInt(numerStr, 10);
    const denom = parseInt(denomStr, 10);
    if (!isNaN(whole) && !isNaN(numer) && !isNaN(denom) && denom !== 0) {
      return whole + numer / denom;
    }
  }
  const plain = parseFloat(raw);
  return isNaN(plain) ? 0 : plain;
}

// ─── Smart size extractor ─────────────────────────────────────────────────
// Handles all of these product name formats:
//   "SS 304 PIPE SCH-10 1/2""       -> 0.5
//   "SS 304 PIPE SCH-40 11/2""      -> 1.5
//   "SS 304 PIPE SCH-40 3""         -> 3
//   "SS 304 PIPE ERW 15 NB"         -> 15  (NB mm values left as-is, they're already numeric)
//   "40 X 40 SQUARE"                -> 40  (mm square)
function extractSizeKey(productName) {
  // Normalise: collapse whitespace, keep special chars
  const n = productName.trim();

  // ——— 1. Inch notation with " symbol: e.g. 1/4", 11/2", 3"
  //   Regex: one or more digits optionally followed by /digits, then optional space, then "
  const inchMatch = n.match(/(\d+(?:\/\d+)?)\s*"/i);
  if (inchMatch) {
    return parseInchFraction(inchMatch[1]);
  }

  // ——— 2. NB notation: e.g. 15 NB, 100 NB
  //   Only integer NB (mm) values; no fractions expected for NB
  const nbMatch = n.match(/(\d+(?:\.\d+)?)\s*NB/i);
  if (nbMatch) {
    return parseFloat(nbMatch[1]);
  }

  // ——— 3. mm square/rectangular: e.g. "40 X 40", "25 X 50", "25MM"
  const mmMatch = n.match(/(\d+(?:\.\d+)?)\s*(?:X\s|MM)/i);
  if (mmMatch) return parseFloat(mmMatch[1]);

  // ——— 4. Fallback: first standalone number in name
  const anyNum = n.match(/(\d+(?:\.\d+)?)/);
  if (anyNum) return parseFloat(anyNum[1]);

  return 0;
}

function sortProductsBySize(products) {
  return [...products].sort((a, b) => {
    const sizeA = extractSizeKey(a.product_name);
    const sizeB = extractSizeKey(b.product_name);
    if (sizeA !== sizeB) return sizeA - sizeB;
    // same size: fall back to product_id
    return a.product_id.localeCompare(b.product_id);
  });
}

// ─── Category display order ───────────────────────────────────────────────────
const CATEGORY_ORDER = [
  "SCH 5", "SCH 10", "SCH 20", "SCH 40", "SCH 80", "SCH 160",
  "Seamless",
  "SWG 20", "SWG 18", "SWG 16", "SWG 14", "SWG 12", "SWG 10",
  "ERW", "Polish Pipe", "Square Rod", "Rectangular Pipe",
  "Round Bar", "Flat Bar", "Angle", "Channel",
  "Sheet / Plate", "Coil / Strip", "Pipe (General)", "General",
];

function sortCategoryKeys(keys) {
  return [...keys].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Products() {
  const [products, setProducts] = useState([]);
  const [orderedIds, setOrderedIds] = useState([]);
  const [stockSummary, setStockSummary] = useState({});
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewMode, setViewMode] = useState("catalog"); // "catalog" | "table"

  const [latestTally, setLatestTally] = useState(null);
  const [tallyLoading, setTallyLoading] = useState(false);

  const [openMaterials, setOpenMaterials] = useState({});
  const [openCategories, setOpenCategories] = useState({});

  const [form, setForm] = useState({
    product_id: "",
    product_name: "",
    low_stock_alert: "",
    high_stock_alert: "",
    adj_location_id: "",
    adj_quantity: "",
    adj_type: "inward",
    adj_party: "",
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    checkUserRole();
    loadProducts();
    loadLatestTally();

    const channel = supabase
      .channel("transactions-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => { loadStockSummary(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadProducts();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (ADMIN_EMAILS.includes(user?.email)) setIsAdmin(true);
  };

  const loadLatestTally = async () => {
    try {
      const { data, error } = await supabase
        .from("tally_logs")
        .select("*")
        .order("tallied_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setLatestTally(data || null);
    } catch (err) {
      console.error("Failed to load tally log:", err.message);
    }
  };

  const handleTallyNow = async () => {
    if (!window.confirm("Mark all products as tallied right now?")) return;
    setTallyLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || "unknown";
      const { error } = await supabase.from("tally_logs").insert([{
        tallied_at: new Date().toISOString(),
        tallied_by: email
      }]);
      if (error) throw error;
      await loadLatestTally();
      alert("✅ Tally recorded successfully!");
    } catch (err) {
      console.error("Tally error:", err.message);
      alert("Error recording tally: " + err.message);
    } finally {
      setTallyLoading(false);
    }
  };

  const loadStockSummary = async () => {
    try {
      const { data, error } = await supabase.from("stock_summary").select("*");
      if (error) throw error;
      const summary = {};
      (data || []).forEach(row => {
        if (!summary[row.product_id]) summary[row.product_id] = {};
        const qty = row.current_stock ?? row.total_stock ?? 0;
        summary[row.product_id][row.location_name] = qty;
      });
      setStockSummary(summary);
    } catch (err) {
      console.error("Failed to load stock summary:", err.message);
    }
  };

  const getDefaultOrder = (prod) =>
    [...prod]
      .sort((a, b) => a.product_id.localeCompare(b.product_id))
      .map(p => p.id);

  const loadProducts = async () => {
    try {
      const { data: prod, error: prodErr } = await supabase.from("products").select("*");
      const { data: loc, error: locErr } = await supabase.from("locations").select("*");

      if (prodErr) throw prodErr;
      if (locErr) throw locErr;

      setProducts(prod || []);
      setLocations(loc || []);

      const savedOrder = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (savedOrder.length > 0) {
        const savedIds = savedOrder.filter(id => (prod || []).some(p => p.id === id));
        const newIds = getDefaultOrder(prod || []).filter(id => !savedIds.includes(id));
        setOrderedIds([...savedIds, ...newIds]);
      } else {
        setOrderedIds(getDefaultOrder(prod || []));
      }

      await loadStockSummary();
    } catch (err) {
      console.error("Failed loading data from Supabase:", err.message);
    }
  };

  const stockByLocation = (productId, locationName) =>
    stockSummary[productId]?.[locationName] ?? 0;

  const totalStock = (productId) =>
    Object.values(stockSummary[productId] || {}).reduce((s, v) => s + v, 0);

  const saveOrder = (ids) => localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));

  const resetOrder = () => {
    const defaultIds = getDefaultOrder(products);
    setOrderedIds(defaultIds);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleDragStart = (e, index) => {
    dragIndexRef.current = index;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null); setIsDragging(false); return;
    }
    const newIds = [...orderedIds];
    const [moved] = newIds.splice(fromIndex, 1);
    newIds.splice(dropIndex, 0, moved);
    setOrderedIds(newIds);
    saveOrder(newIds);
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setIsDragging(false);
  };
  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setIsDragging(false);
  };
  const touchStartY = useRef(null);
  const touchFromIndex = useRef(null);
  const handleTouchStart = (e, index) => {
    touchStartY.current = e.touches[0].clientY;
    touchFromIndex.current = index;
  };
  const handleTouchEnd = (e) => {
    if (touchFromIndex.current === null) return;
    const endY = e.changedTouches[0].clientY;
    const rows = document.querySelectorAll("tr[data-drag-index]");
    let dropIdx = touchFromIndex.current;
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (endY > rect.top + rect.height / 2) dropIdx = Number(row.getAttribute("data-drag-index"));
    });
    if (dropIdx !== touchFromIndex.current) {
      const newIds = [...orderedIds];
      const [moved] = newIds.splice(touchFromIndex.current, 1);
      newIds.splice(dropIdx, 0, moved);
      setOrderedIds(newIds);
      saveOrder(newIds);
    }
    touchFromIndex.current = null;
  };

  const formatTallyDisplay = (dbDateString) => {
    if (!dbDateString) return null;
    return new Date(dbDateString).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    });
  };

  const openLedger = async (product) => {
    setSelectedProduct(product);
    setLedger([]);
    setLedgerLoading(true);
    try {
      const { data: productTrans, error } = await supabase
        .from("transactions")
        .select("*, locations(name)")
        .eq("product_id", product.id)
        .order("created_at", { ascending: true });
      if (error) throw error;

      let balance = 0;
      const calculated = (productTrans || []).map(t => {
        if (t.transaction_type === "inward") balance += Number(t.quantity);
        else balance -= Number(t.quantity);
        return { ...t, location_name: t.locations?.name || "", balance };
      });
      setLedger(calculated);
      await loadStockSummary();
    } catch (err) {
      console.error("Failed to load ledger:", err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!products.length) return;
    const data = products.map(p => ({
      Product_ID: p.product_id,
      Product_Name: p.product_name,
      Office: stockByLocation(p.id, "Office"),
      Godown: stockByLocation(p.id, "Godown"),
      Warehouse: stockByLocation(p.id, "Warehouse"),
      Low_Alert: p.low_stock_alert,
      High_Alert: p.high_stock_alert,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Products_Report.xlsx");
  };

  const handleExportPDF = () => {
    try {
      if (!products.length) return;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(13);
      doc.setTextColor(10, 42, 94);
      doc.text("Products Report — Nivee Metals", 14, 13);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Generated: " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), 14, 19);
      const head = [["Product ID", "Product Name", "Office", "Godown", "Warehouse", "Low Alert", "High Alert"]];
      const body = products.map(p => [
        p.product_id, p.product_name,
        String(stockByLocation(p.id, "Office")),
        String(stockByLocation(p.id, "Godown")),
        String(stockByLocation(p.id, "Warehouse")),
        String(p.low_stock_alert),
        String(p.high_stock_alert || 0)
      ]);
      autoTable(doc, {
        head, body, startY: 23, theme: "grid",
        styles: { fontSize: 7, cellPadding: 2, overflow: "ellipsize", halign: "left", lineColor: [220, 220, 220], lineWidth: 0.2 },
        headStyles: { fillColor: [10, 42, 94], textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 249, 252] },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 80 }, 2: { cellWidth: 22, halign: "center" }, 3: { cellWidth: 22, halign: "center" }, 4: { cellWidth: 26, halign: "center" }, 5: { cellWidth: 22, halign: "center" }, 6: { cellWidth: 22, halign: "center" } },
        margin: { top: 23, left: 14, right: 14 }
      });
      doc.save("Products_Report.pdf");
    } catch (err) {
      console.error("PDF export error:", err);
      alert("PDF export failed: " + err.message);
    }
  };

  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const localEmail = localStorage.getItem("userEmail");
        const { data: { user } } = await supabase.auth.getUser();
        const activeEmployee = user?.email || localEmail || "System Admin";
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (data.length === 0) throw new Error("Spreadsheet is empty.");
        const headers = Object.keys(data[0]);
        const normalize = (str) => String(str).toLowerCase().replace(/[\s_]/g, '');
        const locationMap = [];
        locations.forEach(loc => {
          const match = headers.find(k => normalize(k) === normalize(loc.name));
          if (match) locationMap.push({ id: loc.id, name: loc.name, headerKey: match });
        });
        if (locationMap.length === 0)
          throw new Error("Couldn't find location columns. Add: " + locations.map(l => l.name).join(", "));
        const idKey = headers.find(k => normalize(k).includes('productid') || normalize(k) === 'id');
        const nameKey = headers.find(k => normalize(k).includes('productname') || normalize(k) === 'name');
        const lowAlertKey = headers.find(k => normalize(k).includes('low'));
        const highAlertKey = headers.find(k => normalize(k).includes('high') || normalize(k).includes('max'));
        if (!highAlertKey) {
          const proceed = window.confirm("⚠️ Couldn't find High Alert column.\nHeaders: [ " + headers.join(", ") + " ]\nContinue with High Alert = 0?");
          if (!proceed) { e.target.value = null; return; }
        }
        const productsToUpsert = [];
        const validRows = [];
        data.forEach(row => {
          if (idKey && row[idKey] && nameKey && row[nameKey]) {
            productsToUpsert.push({
              product_id: String(row[idKey]),
              product_name: String(row[nameKey]),
              low_stock_alert: Number(row[lowAlertKey] || 0),
              high_stock_alert: Number(row[highAlertKey] || 0)
            });
            validRows.push(row);
          }
        });
        if (productsToUpsert.length === 0) {
          alert("No valid data. Ensure headers include 'Product ID' and 'Product Name'."); return;
        }
        const { data: upsertedProducts, error: prodErr } = await supabase
          .from("products").upsert(productsToUpsert, { onConflict: "product_id" }).select("*");
        if (prodErr) throw prodErr;
        const transactionsToInsert = [];
        validRows.forEach(row => {
          const dbProduct = upsertedProducts.find(p => p.product_id === String(row[idKey]));
          if (dbProduct) {
            locationMap.forEach(loc => {
              const stock = Number(row[loc.headerKey] || 0);
              if (stock > 0) transactionsToInsert.push({
                product_id: dbProduct.id, location_id: loc.id,
                transaction_type: "inward", quantity: stock,
                party: "Bulk Opening Stock", created_by_email: activeEmployee
              });
            });
          }
        });
        if (transactionsToInsert.length > 0) {
          const { error: transErr } = await supabase.from("transactions").insert(transactionsToInsert);
          if (transErr) throw transErr;
        }
        alert("Success! Updated " + upsertedProducts.length + " products and logged " + transactionsToInsert.length + " stock allocations.");
        loadProducts();
      } catch (err) {
        console.error("Bulk upload error:", err.message);
        alert("Upload Failed: " + err.message);
      } finally { e.target.value = null; }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveProduct = async () => {
    if (!form.product_id || !form.product_name) {
      alert("Please fill in the Product ID and Name."); return;
    }
    try {
      const payload = {
        product_id: form.product_id,
        product_name: form.product_name,
        low_stock_alert: Number(form.low_stock_alert || 0),
        high_stock_alert: Number(form.high_stock_alert || 0)
      };
      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
        if (form.adj_location_id && form.adj_quantity && Number(form.adj_quantity) > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          const { error: transErr } = await supabase.from("transactions").insert([{
            product_id: editingId,
            location_id: form.adj_location_id,
            transaction_type: form.adj_type,
            quantity: Number(form.adj_quantity),
            party: form.adj_party || "Manual Adjustment",
            created_by_email: user?.email || "admin"
          }]);
          if (transErr) throw transErr;
        }
      } else {
        const { error } = await supabase.from("products").insert([payload]);
        if (error) throw error;
      }
      setForm({ product_id: "", product_name: "", low_stock_alert: "", high_stock_alert: "", adj_location_id: "", adj_quantity: "", adj_type: "inward", adj_party: "" });
      setEditingId(null);
      loadProducts();
    } catch (err) {
      console.error("Failed to save product:", err.message);
      alert("Error saving product. Is the ID already taken?");
    }
  };

  const handleEditClick = (e, product) => {
    e.stopPropagation();
    setForm({
      product_id: product.product_id,
      product_name: product.product_name,
      low_stock_alert: product.low_stock_alert,
      high_stock_alert: product.high_stock_alert || "",
      adj_location_id: "",
      adj_quantity: "",
      adj_type: "inward",
      adj_party: "",
    });
    setEditingId(product.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setForm({ product_id: "", product_name: "", low_stock_alert: "", high_stock_alert: "", adj_location_id: "", adj_quantity: "", adj_type: "inward", adj_party: "" });
    setEditingId(null);
  };

  const handleDeleteProduct = async (e, productId) => {
    e.stopPropagation();
    if (!isAdmin) { alert("Unauthorized: Only admins can delete products."); return; }
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      const { error } = await supabase.from("products").delete().eq("product_id", productId);
      if (error) throw error;
      loadProducts();
    } catch (err) {
      console.error("Failed to delete product:", err.message);
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const orderedProducts = orderedIds.map(id => products.find(p => p.id === id)).filter(Boolean);
  const filtered = orderedProducts.filter(
    p => p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
         p.product_id?.toLowerCase().includes(search.toLowerCase())
  );

  const catalogSource = search ? filtered : products;
  const catalog = buildCatalog(catalogSource);
  const materialKeys = Object.keys(catalog).sort();

  const toggleMaterial = (mat) =>
    setOpenMaterials(prev => ({ ...prev, [mat]: !prev[mat] }));

  const toggleCategory = (key) =>
    setOpenCategories(prev => ({ ...prev, [key]: !prev[key] }));

  const stockBadge = (product) => {
    const total = totalStock(product.id);
    const low = product.low_stock_alert;
    if (low && total <= low) return (
      <span className="ml-2 text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">Low Stock</span>
    );
    return null;
  };

  return (
    <div className="p-6">
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Products</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 text-sm font-semibold">
            <button
              onClick={() => setViewMode("catalog")}
              className={`px-4 py-2 transition-colors ${viewMode === "catalog" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              📂 Catalog View
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-4 py-2 transition-colors ${viewMode === "table" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              📋 Table View
            </button>
          </div>
          <button
            onClick={handleTallyNow}
            disabled={tallyLoading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl shadow transition-all text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            {tallyLoading ? "Saving..." : "📋 Tally Now"}
          </button>
        </div>
      </div>

      {latestTally && (
        <div className="mb-4 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 flex items-center gap-2">
          <span>✅</span>
          <span>Last tallied on <strong>{formatTallyDisplay(latestTally.tallied_at)}</strong> by {latestTally.tallied_by}</span>
        </div>
      )}

      {/* ADD / EDIT FORM */}
      <div className="bg-white shadow rounded p-4 mb-6">
        <div className="flex gap-3 items-center flex-wrap">
          <input name="product_id" placeholder="Product ID" value={form.product_id} onChange={handleChange} disabled={!!editingId} className="border p-2 rounded flex-1 min-w-[150px] disabled:bg-gray-100" />
          <input name="product_name" placeholder="Product Name" value={form.product_name} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[150px]" />
          <input name="low_stock_alert" placeholder="Low Alert Qty" type="number" value={form.low_stock_alert} onChange={handleChange} className="border p-2 rounded w-32" />
          <input name="high_stock_alert" placeholder="High Alert Qty" type="number" value={form.high_stock_alert} onChange={handleChange} className="border p-2 rounded w-32" />

          {!editingId && (
            <button onClick={handleSaveProduct} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded">Add</button>
          )}

          {!editingId && (
            <div className="ml-auto flex gap-2 items-center">
              <input type="file" accept=".xlsx, .xls, .csv" style={{ display: "none" }} ref={fileInputRef} onChange={handleBulkUpload} />
              <div className="flex flex-col items-end">
                <button onClick={() => fileInputRef.current.click()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors">
                  Bulk Upload
                </button>
                <span className="text-xs text-gray-500 mt-1">Headers: Product ID, Product Name, Low Alert, High Alert, Office, Godown, Warehouse</span>
              </div>
              <button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors self-start">
                Export Excel
              </button>
              <button onClick={handleExportPDF} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors self-start">
                Export PDF
              </button>
            </div>
          )}
        </div>

        {editingId && (
          <div className="mt-4 pt-4 border-t border-dashed border-orange-300">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-3">📦 Stock Adjustment (optional)</p>
            <div className="flex gap-3 items-center flex-wrap">
              <select name="adj_location_id" value={form.adj_location_id} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[140px] bg-white">
                <option value="">— Select Location —</option>
                {locations.map(loc => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
              </select>
              <div className="flex rounded overflow-hidden border">
                <button type="button" onClick={() => setForm(f => ({ ...f, adj_type: "inward" }))} className={`px-4 py-2 text-sm font-semibold transition-colors ${form.adj_type === "inward" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>▲ Inward</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, adj_type: "outward" }))} className={`px-4 py-2 text-sm font-semibold transition-colors ${form.adj_type === "outward" ? "bg-red-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>▼ Outward</button>
              </div>
              <input name="adj_quantity" placeholder="Quantity" type="number" min="0" value={form.adj_quantity} onChange={handleChange} className="border p-2 rounded w-32" />
              <input name="adj_party" placeholder="Party / Remark (optional)" value={form.adj_party} onChange={handleChange} className="border p-2 rounded flex-1 min-w-[180px]" />
              <button onClick={handleSaveProduct} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded font-semibold">Update</button>
              <button onClick={cancelEdit} className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded">Cancel</button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Leave Location &amp; Quantity blank to update product details only without logging a transaction.</p>
          </div>
        )}
      </div>

      {/* SEARCH + RESET ORDER */}
      <div className="flex gap-3 items-center mb-4">
        <input
          placeholder="Search by ID or Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded flex-1"
        />
        {viewMode === "table" && (
          <button onClick={resetOrder} title="Restore alphabetical product order" className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded transition-colors whitespace-nowrap">
            ↺ Reset Order
          </button>
        )}
      </div>

      {/* CATALOG VIEW */}
      {viewMode === "catalog" && (
        <div className="space-y-3">
          {materialKeys.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No products found</div>
          ) : (
            materialKeys.map(mat => {
              const isMaterialOpen = openMaterials[mat] !== false;
              const catKeys = sortCategoryKeys(Object.keys(catalog[mat]));
              const totalProductsInMat = catKeys.reduce((s, c) => s + catalog[mat][c].length, 0);

              return (
                <div key={mat} className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
                  <button
                    onClick={() => toggleMaterial(mat)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-700 to-blue-800 text-white hover:from-blue-800 hover:to-blue-900 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold">{mat}</span>
                      <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
                        {totalProductsInMat} products · {catKeys.length} categories
                      </span>
                    </div>
                    <span className="text-xl font-light">{isMaterialOpen ? "▲" : "▼"}</span>
                  </button>

                  {isMaterialOpen && (
                    <div className="divide-y divide-gray-100">
                      {catKeys.map(cat => {
                        const catKey = mat + "||" + cat;
                        const isCatOpen = openCategories[catKey] !== false;
                        const catProducts = sortProductsBySize(catalog[mat][cat]);

                        return (
                          <div key={cat}>
                            <button
                              onClick={() => toggleCategory(catKey)}
                              className="w-full flex items-center justify-between px-6 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-blue-800">{cat}</span>
                                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                                  {catProducts.length} item{catProducts.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                              <span className="text-blue-400 text-sm">{isCatOpen ? "▲" : "▼"}</span>
                            </button>

                            {isCatOpen && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                    <tr>
                                      <th className="px-6 py-2 text-left font-semibold">Product ID</th>
                                      <th className="px-4 py-2 text-left font-semibold">Product Name</th>
                                      <th className="px-4 py-2 text-center font-semibold">Office</th>
                                      <th className="px-4 py-2 text-center font-semibold">Godown</th>
                                      <th className="px-4 py-2 text-center font-semibold">Warehouse</th>
                                      <th className="px-4 py-2 text-center font-semibold">Total</th>
                                      <th className="px-4 py-2 text-center font-semibold">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {catProducts.map((p, idx) => {
                                      const total = totalStock(p.id);
                                      const isLow = p.low_stock_alert && total <= p.low_stock_alert;
                                      return (
                                        <tr
                                          key={p.id}
                                          onClick={() => openLedger(p)}
                                          className={`border-t border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"}`}
                                        >
                                          <td className="px-6 py-3 font-mono text-xs text-gray-600">{p.product_id}</td>
                                          <td className="px-4 py-3 font-medium text-gray-800">
                                            {p.product_name}
                                            {stockBadge(p)}
                                          </td>
                                          <td className="px-4 py-3 text-center tabular-nums">{stockByLocation(p.id, "Office")}</td>
                                          <td className="px-4 py-3 text-center tabular-nums">{stockByLocation(p.id, "Godown")}</td>
                                          <td className="px-4 py-3 text-center tabular-nums">{stockByLocation(p.id, "Warehouse")}</td>
                                          <td className={`px-4 py-3 text-center font-bold tabular-nums ${isLow ? "text-red-600" : "text-gray-800"}`}>
                                            {total}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <div className="flex gap-1 justify-center">
                                              <button
                                                onClick={(e) => handleEditClick(e, p)}
                                                className="bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs px-2 py-1 rounded font-semibold transition-colors"
                                              >
                                                Edit
                                              </button>
                                              {isAdmin && (
                                                <button
                                                  onClick={(e) => handleDeleteProduct(e, p.product_id)}
                                                  className="bg-red-100 hover:bg-red-200 text-red-700 text-xs px-2 py-1 rounded font-semibold transition-colors"
                                                >
                                                  Del
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "table" && (
        <div className="bg-white shadow rounded overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr className="text-left text-gray-700">
                <th className="p-3 w-10 text-gray-400 text-xs uppercase">Order</th>
                <th className="p-3">Product ID</th>
                <th className="p-3">Product Name</th>
                <th className="p-3">Office</th>
                <th className="p-3">Godown</th>
                <th className="p-3">Warehouse</th>
                <th className="p-3">Low Alert</th>
                <th className="p-3">High Alert</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="9" className="p-4 text-gray-500 text-center">No products found</td></tr>
              ) : (
                filtered.map((p, index) => {
                  const isDraggedRow = isDragging && dragIndexRef.current === index;
                  const isDropTarget = dragOverIndex === index && dragIndexRef.current !== index;
                  return (
                    <tr
                      key={p.id}
                      data-drag-index={index}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => handleTouchStart(e, index)}
                      onTouchEnd={(e) => handleTouchEnd(e, index)}
                      onClick={() => openLedger(p)}
                      className={`border-b cursor-pointer transition-colors
                        ${isDraggedRow ? "opacity-40" : ""}
                        ${isDropTarget ? "border-t-2 border-blue-400" : ""}
                        hover:bg-blue-50`}
                    >
                      <td className="p-3 text-gray-400 select-none cursor-grab active:cursor-grabbing text-center">⠿</td>
                      <td className="p-3 font-mono text-sm text-gray-600">{p.product_id}</td>
                      <td className="p-3 font-medium">
                        {p.product_name}
                        {stockBadge(p)}
                      </td>
                      <td className="p-3 tabular-nums">{stockByLocation(p.id, "Office")}</td>
                      <td className="p-3 tabular-nums">{stockByLocation(p.id, "Godown")}</td>
                      <td className="p-3 tabular-nums">{stockByLocation(p.id, "Warehouse")}</td>
                      <td className="p-3 text-orange-600 font-semibold">{p.low_stock_alert}</td>
                      <td className="p-3 text-blue-600 font-semibold">{p.high_stock_alert || 0}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => handleEditClick(e, p)}
                            className="bg-yellow-400 hover:bg-yellow-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={(e) => handleDeleteProduct(e, p.product_id)}
                              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* LEDGER MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-10 px-4 pb-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">

            <div className="px-7 py-5 border-b bg-gradient-to-r from-blue-700 to-blue-800 rounded-t-2xl text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold leading-tight truncate">{selectedProduct.product_name}</h2>
                  <p className="text-blue-200 font-mono text-sm mt-1">{selectedProduct.product_id}</p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="text-blue-200 hover:text-white text-3xl font-light transition-colors leading-none mt-0.5 shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-7 py-4 bg-gray-50 border-b">
              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-3">
                  {locations.map(loc => (
                    <div key={loc.id} className="flex flex-col items-center bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm min-w-[90px]">
                      <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{loc.name}</span>
                      <span className="text-2xl font-extrabold text-blue-700 tabular-nums">{stockByLocation(selectedProduct.id, loc.name)}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center bg-blue-700 border border-blue-700 rounded-xl px-5 py-3 shadow-sm min-w-[90px]">
                    <span className="text-xs text-blue-200 uppercase tracking-wide font-semibold mb-1">Total</span>
                    <span className="text-2xl font-extrabold text-white tabular-nums">{totalStock(selectedProduct.id)}</span>
                  </div>
                </div>

                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border text-sm font-medium ${
                  latestTally ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-gray-100 border-gray-200 text-gray-400"
                }`}>
                  <span className="text-base">{latestTally ? "✅" : "⏳"}</span>
                  <div>
                    <div className="text-xs uppercase tracking-wide font-semibold opacity-70 mb-0.5">Last Tally</div>
                    {latestTally ? (
                      <>
                        <div className="font-bold">{formatTallyDisplay(latestTally.tallied_at)}</div>
                        <div className="text-xs opacity-70">by {latestTally.tallied_by}</div>
                      </>
                    ) : (
                      <div>No tally recorded yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {ledgerLoading ? (
                <div className="p-10 text-center text-gray-400 text-base">
                  <div className="text-3xl mb-3">⏳</div>
                  Loading transactions...
                </div>
              ) : ledger.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-base">
                  <div className="text-3xl mb-3">📭</div>
                  No transactions yet for this product.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 border-b shadow-sm">
                    <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                      <th className="px-5 py-3 font-semibold">Date / Time</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Location</th>
                      <th className="px-4 py-3 text-right font-semibold">Qty</th>
                      <th className="px-4 py-3 text-right font-semibold">Balance</th>
                      <th className="px-4 py-3 font-semibold">Party</th>
                      <th className="px-4 py-3 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((t, i) => (
                      <tr key={t.id} className={`border-b hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                        <td className="px-5 py-3 text-gray-600 text-sm font-mono whitespace-nowrap">
                          {new Date(t.created_at).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit", hour12: true
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.transaction_type === "inward" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {t.transaction_type === "inward" ? "▲ IN" : "▼ OUT"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{t.location_name}</td>
                        <td className={`px-4 py-3 text-right font-bold text-base tabular-nums ${t.transaction_type === "inward" ? "text-green-700" : "text-red-600"}`}>
                          {t.transaction_type === "inward" ? "+" : "-"}{t.quantity}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-base tabular-nums text-gray-800">{t.balance}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{t.party || "—"}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{t.created_by_email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-7 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between">
              <span className="text-sm text-gray-400">{ledger.length} transaction{ledger.length !== 1 ? "s" : ""} recorded</span>
              <button
                onClick={() => setSelectedProduct(null)}
                className="bg-gray-700 hover:bg-gray-800 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
