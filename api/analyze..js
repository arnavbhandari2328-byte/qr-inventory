import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // ✅ This checks for BOTH names just in case
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API Key missing in Vercel. Please check settings." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const { inventoryData, question } = req.body;
    const prompt = `You are the Nivee Metal AI Manager. Data: ${JSON.stringify(inventoryData)}. Question: ${question}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.status(200).json({ answer: response.text() });
  } catch (err) {
    res.status(500).json({ error: "AI Error: " + err.message });
  }
}