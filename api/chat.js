// Trusty Brain - Knows BOTH:
// 1. GROQ OpenAI = Brain (thinks, talks like ChatGPT / Meta AI)
// 2. SUPABASE = Memory / Database (users, Trust Score, products, verification)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ reply: "Use POST" });
  const { message, history = [], userName = "", userPhone = "" } = req.body || {};
  if (!message) return res.status(400).json({ reply: "Please type a message." });

  // --- 1. CHECK SUPABASE MEMORY ---
  let supabaseContext = "No Supabase data found yet.";
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    // If user gave phone/name, try to look them up in Supabase
    if (SUPABASE_URL && SUPABASE_KEY && userPhone) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?phone=eq.${encodeURIComponent(userPhone)}&select=name,phone,trust_score,verified,is_seller`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
      });
      const data = await r.json();
      if (data && data[0]) {
        supabaseContext = `Supabase Database Found This User: Name: ${data[0].name}, Phone: ${data[0].phone}, Trust Score: ${data[0].trust_score}, Verified: ${data[0].verified}, Seller: ${data[0].is_seller}. Use this real data in your answer.`;
      }
    }
  } catch (e) {
    supabaseContext = "Supabase lookup failed, use general knowledge.";
  }

  // --- 2. CHECK GROQ BRAIN ---
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ reply: "GROQ_API_KEY is missing in Vercel. Go to Vercel > Settings > Environment Variables > Add GROQ_API_KEY, then Redeploy." });
  }

  const system = `You are Trusty, the AI assistant for TrustMart AI.

You have TWO systems working together. You must know both and explain them when asked:

1. GROQ OPENAI = YOUR BRAIN
- You think, talk, and answer using Groq OpenAI-Compatible API.
- Model: llama-3.3-70b-versatile
- Endpoint: https://api.groq.com/openai/v1/chat/completions
- This is what makes you smart like Meta AI and ChatGPT. You can answer ANY question: business, fashion, education, coding, writing, ideas, pricing, marketing.

2. SUPABASE = YOUR MEMORY / DATABASE
- Supabase stores ALL TrustMart data. It is your memory.
- Tables:
    - profiles: name, phone, email, trust_score (0-100), verified (true/false), is_seller, address, nin
    - products: title, price, category (clothes / shoes / jewellery), image, seller_phone, description
    - verifications: user_phone, type (phone/address/NIN/identity), status
- When a user creates an account, it is saved in Supabase profiles.
- When a user adds goods, it is saved in Supabase products.
- When a user gets verified, Supabase updates their trust_score.
- Trust Score: 0-100. High = Trusted & Legit, Low = Not Recommended.
- 12-hour verification for buyers and sellers to prevent scams.
- If a user asks "What is my Trust Score?" or "Is this person legit?", you must use Supabase data if available, not guess.

CURRENT SUPABASE DATA FOR THIS USER:
${supabaseContext}

Style: Exactly like Meta AI and ChatGPT. Clear, calm, professional, intelligent. No slang. Use headings and bullet points when helpful.

Rules:
- Do not force onboarding. Only start account creation if user says they want to start, sell, buy, or create account.
- If user just wants to chat, answer fully like ChatGPT.
- Always give a complete answer, then ask one relevant follow-up question.
- If user asks about Groq or Supabase, explain clearly: Groq = Brain, Supabase = Memory/Database.
- Never reveal API keys.
${userName ? `User name is ${userName}.` : ``}`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, ...history.slice(-20), { role: "user", content: message }], temperature: 0.7, max_tokens: 1000 })
    });
    const data = await r.json();
    if (!data.choices?.[0]?.message?.content) {
      return res.status(500).json({ reply: "Groq error: " + (data.error?.message || "Check GROQ_API_KEY in Vercel and redeploy.") });
    }
    return res.status(200).json({ reply: data.choices[0].message.content });
  } catch (e) {
    return res.status(500).json({ reply: "Connection error to Groq: " + e.message });
  }
}
