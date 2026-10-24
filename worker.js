export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("OK");
    const body = await request.json();

    // Cek apakah ada pesan teks masuk
    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      let userText = body.message.text;

      // Abaikan command /start atau /help
      if (userText.startsWith("/")) {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, "Halo bro! Gw asisten AI lo. Tanya apa aja langsung di grup ini.");
        return new Response("OK");
      }

      // Di grup, pesan biasanya ada @NamaBot. Kita hapus biar AI nggak bingung.
      if (body.message.entities) {
          // Potong teks setelah @username jika ada
          userText = userText.replace(/@\w+/g, '').trim();
      }

      // Kasih respon "typing..." di Telegram
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      });

      // Tembak Groq API
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile", // Model gratis Groq yang pinter
            messages: [
              { role: "system", content: "Kamu adalah asisten AI yang cerdas, santai, dan menjawab pakai bahasa Indonesia gaul. Jawab dengan singkat, padat, dan jelas." },
              { role: "user", content: userText }
            ],
            temperature: 0.7
          })
        });

        const groqData = await groqResponse.json();
        
        // Ambil jawaban AI
        if (groqData.choices && groqData.choices.length > 0) {
          const replyText = groqData.choices[0].message.content;
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, replyText);
        } else {
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Maaf bro, AI-nya lagi pusing. Coba lagi nanti.");
        }

      } catch (error) {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Error: ${error.message}`);
      }
    }
    return new Response("OK");
  }
};

async function sendTelegram(token, chatId, text) {
  // Telegram limit 4096 karakter
  if (text.length > 4000) text = text.substring(0, 4000) + "... (dipotong)";
  
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
  });
}
