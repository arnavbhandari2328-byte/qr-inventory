import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase for the backend
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key is missing." });

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const { question } = req.body;

    // 1. Fetch ALL Products and ALL Transactions directly from the database
    const { data: products } = await supabase.from('products').select('*');
    
    // Fetching the last 1000 transactions to give the AI deep context without timing out the server
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*, products(product_name)')
      .order('created_at', { ascending: false })
      .limit(1000); 

    // 2. Build a massive data context for Gemini
    const systemPrompt = `
      You are the Nivee Metal Products Inventory AI. You have access to the full database.
      
      Products Data: ${JSON.stringify(products)}
      Last 1000 Transactions: ${JSON.stringify(transactions)}
      
      User Request: ${question}
      
      Instructions:
      1. Analyze the raw data deeply to answer the prompt.
      2. If the user asks for a report, summarize the data clearly.
      3. Use Markdown tables if you are listing multiple items, stock levels, or transaction histories.
      4. Be professional, concise, and highly accurate.
    `;

    // 3. Ask Gemini 2.5 Flash to process the massive dataset
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt
    });

    return res.status(200).json({ answer: response.text });

  } catch (err) {
    console.error("AI ERROR:", err.message);
    return res.status(500).json({ error: "Google API Error", details: err.message });
  }
}