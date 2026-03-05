import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API Key is missing." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ FIX: Change model name to 'gemini-1.5-flash' 
    // If that still gives a 404, try 'gemini-pro'
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const { inventoryData, question } = req.body;

    const prompt = `
      You are the Nivee Metal AI Manager.
      Inventory Summary: Total Stock is ${inventoryData.totalStock}. 
      There are ${inventoryData.lowStockItems?.length || 0} items low on stock.
      Recent Activity: ${JSON.stringify(inventoryData.recentActivity)}
      
      User Question: ${question}
      
      Provide a helpful, professional response in 2-3 sentences.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ answer: text });

  } catch (err) {
    console.error("AI ERROR:", err.message);
    
    // If gemini-1.5-flash fails, this tells you why in the browser
    return res.status(500).json({ 
      error: "AI Model Error", 
      details: err.message 
    });
  }
}