import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // 1. Only allow POST requests from your frontend
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log("Step 1: API Route Hit. Data received:", req.body);

    // 2. Check for the API key
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error("CRITICAL ERROR: API Key is missing.");
      return res.status(500).json({ error: "API Key is missing in Vercel environment variables." });
    }

    console.log("Step 2: API Key found. Initializing Gemini...");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 3. Extract the data
    const { inventoryData, question } = req.body;
    console.log("Step 3: User asked:", question);

    const prompt = `
      You are the Nivee Metal AI Manager.
      Inventory Data: ${JSON.stringify(inventoryData)}
      User Question: ${question}
      Provide a professional response based on this data.
    `;

    console.log("Step 4: Sending prompt to Google Gemini...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    console.log("Step 5: Success! Returning response to Dashboard.");
    return res.status(200).json({ answer: response.text() });

  } catch (err) {
    // 6. If ANYTHING fails, it gets caught here and printed to Vercel Logs
    console.error("🔥 CRITICAL AI ERROR 🔥");
    console.error("Message:", err.message);
    console.error("Stack Trace:", err.stack);
    
    return res.status(500).json({ error: "AI Error: " + err.message });
  }
}