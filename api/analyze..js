import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY in Vercel settings." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const { inventoryData, question } = req.body;

  const prompt = `
    You are the Nivee Metal AI Manager. 
    Context: ${JSON.stringify(inventoryData)}
    User Question: ${question}
    Provide a professional, technical response based on the inventory data.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.status(200).json({ answer: response.text() });
  } catch (err) {
    res.status(500).json({ error: "AI Error: " + err.message });
  }
}