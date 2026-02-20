const API_URL = "https://qr-inventory.onrender.com";

export const getProducts = async () => {
  const res = await fetch(`${API_URL}/products`);
  return res.json();
};

export const getLocations = async () => {
  const res = await fetch(`${API_URL}/locations`);
  return res.json();
};

export const getTransactions = async () => {
  const res = await fetch(`${API_URL}/transactions`);
  return res.json();
};

export const addTransaction = async (data) => {
  const res = await fetch(`${API_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
};