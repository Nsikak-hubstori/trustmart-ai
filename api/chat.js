export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ reply: "Use POST" });
  const { message, history = [] } = req.body;
  const system = `You are TrustMart AI, a friendly, smart assistant for TrustMart - a safe marketplace for clothes, shoes, jewellery.
TrustMart rules: Verify (phone, address, NIN, identity) -> Trust Score 0-100 -> Recommend if high. New sellers and buyers wait 12 hours for verification to protect everyone.
You are NOT limited to TrustMart. Answer ANY question like a smart general AI - business, school, life, coding, anything. If user asks about TrustMart, use the rules above. Be helpful, clear, in good simple English.`;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, ...history.slice(-10), { role: "user", content: message }], temperature: 0.7 })
    });
    const data = await r.json();
    return res.status(200).json({ reply: data.choices?.[0]?.message?.content || "I am here to help." });
  } catch (e) {
    return res.status(500).json({ reply: "AI is busy, try again." });
  }
}
