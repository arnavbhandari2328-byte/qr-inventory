const mapProduct = (p) => ({
  id: p.id,
  name: p.product_name,
  sku: p.product_id,
  lowStock: p.low_stock_alert,
  createdAt: p.created_at,
});
const API_URL = "https://qr-inventory.onrender.com/api";

/* PRODUCTS */
export const getProducts = async () => {
  const res = await fetch(`${API_URL}/products`);
  const data = await res.json();
  return data.map(mapProduct);
};

/* LOCATIONS */
export const getLocations = async () => {
  const res = await fetch(`${API_URL}/locations`);
  return res.json();
};

/* TRANSACTIONS */
export const getTransactions = async () => {
  const res = await fetch(`${API_URL}/transactions`);
  const data = await res.json();
return data || [];
};

export const addTransaction = async (data) => {
  const res = await fetch(`${API_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return res.json();   // ⭐ VERY IMPORTANT
};
