export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("OK");
    const body = await request.json();

    // --- FITUR BARU: SAMBUTAN MEMBER BARU ---
    if (body.message && body.message.new_chat_members) {
      const chatId = body.message.chat.id;
      const newMembers = body.message.new_chat_members;

      for (const member of newMembers) {
        // Pastiin yang masuk bukan bot (biar bot nggak nyapa diri sendiri)
        if (!member.is_bot) {
          const memberName = member.first_name || "Bro";
          const welcomeText = `Halo <b>${memberName}</b>! 👋\n\nSelamat datang di grup. Saya adalah <b>Asisten Trading Anjas Hanafi</b>. 🤖📈\n\nSilakan bertanya apa saja seputar trading, market, atau strategi di sini. Saya siap membantu!`;
          
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, welcomeText);
        }
      }
      return new Response("OK");
    }

    // --- LOGIKA CHAT AI (SEPERTI SEBELUMNYA) ---
    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      let userText = body.message.text;

      if (userText.startsWith("/")) {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, "Halo bro! Gw asisten AI lo. Tanya apa aja langsung di grup ini.");
        return new Response("OK");
      }

      if (body.message.entities) {
          userText = userText.replace(/@\w+/g, '').trim();
      }

      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      });

      try {
        if (!env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY belum diisi di Cloudflare Settings!");
        }

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b", 
            messages: [
              { role: "system", content: "Kamu adalah Asisten Trading Anjas Hanafi yang cerdas, santai, dan menjawab pakai bahasa Indonesia gaul. Jawab dengan singkat, padat, dan jelas." },
              { role: "user", content: userText }
            ],
            temperature: 0.7
          })
        });

        const groqData = await groqResponse.json();
        
        if (!groqResponse.ok) {
            throw new Error(`Groq API Error: ${JSON.stringify(groqData.error || groqData)}`);
        }

        if (groqData.choices && groqData.choices.length > 0) {
          const replyText = groqData.choices[0].message.content;
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, replyText);
        } else {
          throw new Error("Format respon Groq tidak dikenal.");
        }

      } catch (error) {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `❌ <b>Error System:</b>\n<code>${error.message}</code>`);
      }
    }
    return new Response("OK");
  }
};

async function sendTelegram(token, chatId, text) {
  if (text.length > 4000) text = text.substring(0, 4000) + "... (dipotong)";
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" })
  });
}
