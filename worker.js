export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("OK");
    const body = await request.json();

    // --- 1. FITUR SAMBUTAN MEMBER BARU ---
    if (body.message && body.message.new_chat_members) {
      const chatId = body.message.chat.id;
      for (const member of body.message.new_chat_members) {
        if (!member.is_bot) {
          const welcomeText = `Halo <b>${member.first_name || "Bro"}</b>! 👋\n\nSelamat datang di grup. Saya <b>Jack</b>, Asisten AI di sini. 🤖📈\n\nPanggil saya (tag) atau reply pesan saya kalau mau ngobrol atau tanya seputar trading!`;
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, welcomeText, null, body.message.message_id);
        }
      }
      return new Response("OK");
    }

    // --- 2. LOGIKA CHAT AI ---
    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      const messageId = body.message.message_id;
      let userText = body.message.text;
      const botUsername = "AgentAsist00bot"; // Username bot lo

      // Anti-Spam: Abaikan kalau yang kirim adalah bot lain (termasuk bot trading)
      if (body.message.from && body.message.from.is_bot) return new Response("OK");

      // Cek apakah Jack dipanggil (di-tag) ATAU dibalas pesannya
      const isTagged = userText.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
      const isReplyToBot = body.message.reply_to_message && body.message.reply_to_message.from.username === botUsername;

      // Kalau nggak di-tag dan nggak di-reply, Jack diem aja (biar nggak spam)
      if (!isTagged && !isReplyToBot) {
          return new Response("OK");
      }

      // Bersihin teks dari tag
      userText = userText.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();

      // Kasih status "typing..."
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      });

      try {
        if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diisi!");

        // Ambil data histori dari GitHub (Biar Jack tau performa trading)
        let historyContext = "Data histori belum tersedia.";
        try {
            const githubRawUrl = "https://raw.githubusercontent.com/nafii21/Agent-tecknikal-New/main/trades_history.json";
            const ghResponse = await fetch(githubRawUrl);
            if (ghResponse.ok) {
                const historyData = await ghResponse.json();
                historyContext = JSON.stringify(historyData.slice(0, 5), null, 2);
            }
        } catch (e) {}

        // Cek apakah user lagi nge-reply pesan orang lain
        let repliedContext = "Tidak ada pesan yang di-reply.";
        if (body.message.reply_to_message && body.message.reply_to_message.text) {
            repliedContext = `User me-reply pesan ini: "${body.message.reply_to_message.text}"`;
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
              { 
                role: "system", 
                content: `Kamu adalah Jack, asisten trading AI di grup Telegram. Kepribadianmu: Santai, asik, gaul (pakai bahasa Indonesia sehari-hari), cerdas, dan suka bercanda tipis-tipis tapi tetap informatif.

                KONTEKS SAAT INI:
                1. ${repliedContext}
                2. Data histori trading terbaru dari sistem: ${historyContext}
                
                ATURAN MENJAWAB:
                - Jawab dengan singkat, padat, dan langsung ke intinya (jangan kayak robot).
                - Kalau ditanya soal status trading/journal, rangkum dari data histori di atas.
                - Kalau user nge-reply pesan sinyal bot trading, jelasin maksud sinyal tersebut.` 
              },
              { role: "user", content: userText }
            ],
            temperature: 0.7
          })
        });

        const groqData = await groqResponse.json();
        if (!groqResponse.ok) throw new Error(`Groq Error: ${JSON.stringify(groqData.error || groqData)}`);

        const replyText = groqData.choices[0].message.content;
        
        // Kirim balasan dengan fitur Reply (ngerujuk ke pesan user)
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, replyText, null, messageId);

      } catch (error) {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `❌ <b>Error System:</b>\n<code>${error.message}</code>`, null, messageId);
      }
    }
    return new Response("OK");
  }
};

async function sendTelegram(token, chatId, text, replyMarkup = null, replyToMessageId = null) {
  if (text.length > 4000) text = text.substring(0, 4000) + "... (dipotong)";
  
  const payload = { chat_id: chatId, text: text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId; // FITUR REPLY

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
