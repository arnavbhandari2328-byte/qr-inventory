import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // 1. Initialize Gemini with your secret key from Vercel
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const { inventoryData, question } = req.body;

  // 2. This "System Prompt" tells Gemini how to behave
  const prompt = `
    You are the Nivee Metal AI Assistant, an expert in industrial stainless steel fittings and warehouse management.
    
    DATA CONTEXT:
    - Total items in stock: ${inventoryData.totalStock}
    - Low Stock Products: ${JSON.stringify(inventoryData.lowStockItems)}
    - Overstock Products: ${JSON.stringify(inventoryData.overstockItems)}
    - Recent Activity: ${JSON.stringify(inventoryData.recentActivity)}

    USER REQUEST: "${question}"

    INSTRUCTIONS:
    - Be professional, concise, and helpful.
    - If asked for a report, use clean bullet points.
    - If a user asks to "draft" a message, write it in a professional WhatsApp/Email style.
    - Always reference specific Product IDs (e.g., NM-PP-...) when discussing stock.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.status(200).json({ answer: response.text() });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "AI Assistant is currently offline. Check Vercel logs." });
  }
}