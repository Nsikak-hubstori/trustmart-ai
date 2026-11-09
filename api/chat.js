// Trusty Brain - Knows BOTH:
// 1. GROQ OpenAI = Brain (thinks, talks like ChatGPT / Meta AI)
// 2. SUPABASE = Memory / Database (users, Trust Score, products, verification)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ reply: "Use POST" });
  const { message, history = [], userName = "", userPhone = "", type = "", name = "", email = "", password = "" } = req.body || {};

  // --- NEW: FORM SIGNUP - From the Box in chat (Name + Email + Password) ---
  // This is called when user fills the box in frontend. Trusty stays same, just saves + sends email.
  if (type === 'signup') {
    if (!name || !email || !password) {
      return res.status(400).json({ reply: "Please fill your Full Name, Email and Password in the form." });
    }
    try {
      const S_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const S_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!S_URL || !S_SERVICE) {
        return res.status(500).json({ reply: "Supabase is not connected in Vercel yet. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY then redeploy." });
      }
      const cleanEmail = email.toLowerCase().trim();
      const fullName = name.trim();
      const first_name = fullName.split(" ")[0] || fullName;
      const last_name = fullName.split(" ").slice(1).join(" ") || "";

      // 1. Create user in Supabase Auth with password they chose
      const createRes = await fetch(`${S_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { "apikey": S_SERVICE, "Authorization": `Bearer ${S_SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: { full_name: fullName, first_name, last_name }
        })
      });
      const created = await createRes.json();
      // If user already exists, we still continue to send them login link
      const userId = created?.id || created?.user?.id || null;

      // 2. Save to users table - remember name + email
      await fetch(`${S_URL}/rest/v1/users`, {
        method: "POST",
        headers: { "apikey": S_SERVICE, "Authorization": `Bearer ${S_SERVICE}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ email: cleanEmail, first_name: first_name, last_name: last_name, id: userId })
      });

      // 3. Send REAL login / dashboard link via Supabase Auth - this sends EMAIL to user
      const linkRes = await fetch(`${S_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: { "apikey": S_SERVICE, "Authorization": `Bearer ${S_SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", email: cleanEmail, options: { redirectTo: "https://trustmart-ai.vercel.app/dashboard.html" } })
      });
      const linkData = await linkRes.json();

      if (linkRes.ok) {
        return res.status(200).json({
          reply: `Perfect ${fullName}, I have saved your account. I just sent a link to your email ${cleanEmail} from TrustMart. Please check your inbox and spam folder and click the link to open your Dashboard. Please remember your login password well, that is what you will use to log in to your Dashboard. You will also need identity verification and selfie later to be recommended as Legit, but you can skip it and do it later if you want. Do you want me to show you how the Dashboard works?`,
          dashboardLink: linkData?.properties?.action_link || "https://trustmart-ai.vercel.app/dashboard",
          showDashboard: true
        });
      } else {
        // Even if link fails, account is created - user can still login with password
        return res.status(200).json({ reply: `Perfect ${fullName}, your account is created for ${cleanEmail}. You can now log in to your Dashboard with the password you just chose. Please remember your login password well, that is what you will use to log in. You will also need identity verification and selfie later to be recommended as Legit, but you can skip it and do it later if you want. Do you want me to show you how the Dashboard works?` });
      }
    } catch (e) {
      return res.status(500).json({ reply: "Sorry, I could not create your account now. Please try again." });
    }
  }

  if (!message && type !== 'signup') return res.status(400).json({ reply: "Please type a message." });

  // --- 1. CHECK SUPABASE MEMORY ---
  let supabaseContext = "No Supabase data found yet.";
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (SUPABASE_URL && SUPABASE_KEY && userPhone) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?phone=eq.${encodeURIComponent(userPhone)}&select=first_name,last_name,email,phone,trust_score,verified,is_seller`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
      });
      const data = await r.json();
      if (data && data[0]) {
        supabaseContext = `Supabase Database Found This User: Name: ${data[0].first_name} ${data[0].last_name}, Phone: ${data[0].phone}, Trust Score: ${data[0].trust_score}, Verified: ${data[0].verified}, Seller: ${data[0].is_seller}. Use this real data in your answer.`;
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

STRICT STYLE RULES - YOU MUST FOLLOW THESE:
- NEVER use Markdown. NEVER use #, ###, **, *, -, ---, or any stars, hashes or bars.
- Write in plain, clean text like a normal human chat.
- Keep answers detailed but short. Maximum 4 to 6 short paragraphs. Explain well, but do not write long essays.
- If you need a list, use numbers like 1. 2. 3. or just write it in sentences. No bullet symbols.
- Talk in detail, but stay concise. Get to the point quickly.

WHAT TO TALK ABOUT - CONCENTRATE ON THIS:
- Focus only on what TrustMart is and how TrustMart works.
- TrustMart is a safe marketplace for clothes, shoes and jewellery.
- How it works: Verify, then Trust Score, then Recommend.
- Verify means phone, address, identity verification and selfie are checked.
- Trust Score is 0 to 100. High score means trusted and legit. Low score means not recommended.
- 12-hour verification protects both buyer and seller.
- Sellers create account, add goods, get verified, get recommended.
- Buyers search products and check Trust Score before paying.
- If someone asks if a person is legit, ask for name, username or Trust Score and explain how to check and scam red flags.
- You can also answer any other general question like ChatGPT: business, fashion, education, coding, writing, ideas, pricing, marketing. Keep those answers short and detailed too.

WHAT NOT TO SAY:
- Do NOT explain how TrustMart was built. Do NOT mention Supabase, Vercel, Groq, API, database, code, model name, or any technology stack.
- ONLY talk about how it was built if the user directly asks: How was TrustMart built? What technology did you use? What is TrustMart built with? How does Trusty work behind the scenes?
- For all other questions like What is TrustMart? How to use TrustMart? How does TrustMart work? Answer only about TrustMart itself, not the technology behind it.
- NEVER say NIN, passport, national ID, or any specific ID type. Only say identity verification and selfie.

OTHER RULES:
- Do not force onboarding. Only start account creation if user says they want to start, sell, buy, or create account.
- If user just wants to chat, answer fully but short.
- Always end with one relevant follow-up question.
- Never reveal API keys.
- ACCOUNT CREATION FLOW: When user wants to create account, talk naturally like you always do and say Just fill this form here for me and tell frontend to show the signup box. Do NOT ask for email or password in chat text, the box will collect Full Name, Email and Password. After they fill the box, tell them you will send a link to their Dashboard to their email, to remember their login password well because that is what they will use to log in, and that they will need identity verification and selfie to be recommended as Legit but they can skip and do it later. NEVER say you will send link unless they filled the box.
${userName ? `User name is ${userName}.` : ``}

CURRENT DATA FROM DATABASE (for your knowledge only, do not mention the database name unless user asks how TrustMart was built):
${supabaseContext}`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "system", content: system }, ...history.slice(-20), { role: "user", content: message }], temperature: 0.7, max_tokens: 800 })
    });
    const data = await r.json();
    if (!data.choices?.[0]?.message?.content) {
      return res.status(500).json({ reply: "Groq error: " + (data.error?.message || "Check GROQ_API_KEY in Vercel and redeploy.") });
    }
    let reply = data.choices[0].message.content;
    reply = reply.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").replace(/^[-_]{2,}$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ reply: "Connection error to Groq: " + e.message });
  }
}
