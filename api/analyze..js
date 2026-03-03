import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // ✅ This checks both names to match your Vercel settings
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API Key is missing in Vercel settings." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const { inventoryData, question } = req.body;

    const prompt = `
      You are the Nivee Metal AI Manager.
      Inventory Data: ${JSON.stringify(inventoryData)}
      User Question: ${question}
      Provide a professional response based on this data.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.status(200).json({ answer: response.text() });
  } catch (err) {
    res.status(500).json({ error: "AI Error: " + err.message });
  }
}