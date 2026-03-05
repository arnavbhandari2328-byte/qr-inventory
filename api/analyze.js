import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API Key is missing." });
    }

    // 1. Initialize the NEW SDK
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const { inventoryData, question } = req.body;

    const prompt = `
      Context: Nivee Metal Inventory.
      Data: ${JSON.stringify(inventoryData)}
      Question: ${question}
      Answer in 2 sentences.
    `;

    // 2. Call the NEW 2.5 Flash model
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    // 3. Send the response back to your dashboard
    return res.status(200).json({ answer: response.text });

  } catch (err) {
    console.error("AI ERROR:", err.message);
    return res.status(500).json({ 
      error: "Google API Error", 
      details: err.message 
    });
  }
}