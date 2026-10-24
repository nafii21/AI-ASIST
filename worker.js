export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("OK");
    const body = await request.json();

    // --- 1. FITUR SAMBUTAN MEMBER BARU ---
    if (body.message && body.message.new_chat_members) {
      const chatId = body.message.chat.id;
      for (const member of body.message.new_chat_members) {
        if (!member.is_bot) {
          const welcomeText = `Halo <b>${member.first_name || "Bro"}</b>! 👋\n\nSelamat datang. Saya <b>Jack</b>, Asisten AI. 🤖📈\n\nTag saya buat ngobrol, atau kirim gambar chart (sambil tag saya) buat dianalisa!`;
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, welcomeText);
        }
      }
      return new Response("OK");
    }

    // --- 2. LOGIKA UTAMA (GAMBAR / TEKS) ---
    if (body.message) {
      const chatId = body.message.chat.id;
      const messageId = body.message.message_id;
      const botUsername = "AgentAsist00bot";
      
      let userText = body.message.text || body.message.caption || "";
      let imageFileId = null;
      let repliedMessage = body.message.reply_to_message;
      
      if (body.message.photo) {
          imageFileId = body.message.photo[body.message.photo.length - 1].file_id;
      } else if (repliedMessage && repliedMessage.photo) {
          imageFileId = repliedMessage.photo[repliedMessage.photo.length - 1].file_id;
      }

      if (body.message.from && body.message.from.is_bot) return new Response("OK");

      const isTagged = userText.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
      const isReplyToBot = repliedMessage && repliedMessage.from.username === botUsername;

      if (!isTagged && !isReplyToBot && !imageFileId) return new Response("OK");

      userText = userText.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
      if (!userText) userText = "Tolong analisa gambar/chart ini.";

      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" })
      });

      try {
        if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diisi!");

        let historyContext = "Data histori belum tersedia.";
        try {
            const githubRawUrl = "https://raw.githubusercontent.com/nafii21/Agent-tecknikal-New/main/trades_history.json";
            const ghResponse = await fetch(githubRawUrl);
            if (ghResponse.ok) {
                const historyData = await ghResponse.json();
                historyContext = JSON.stringify(historyData.slice(0, 5), null, 2);
            }
        } catch (e) {}

        let repliedContext = "Tidak ada pesan yang di-reply.";
        if (repliedMessage && repliedMessage.text) {
            repliedContext = `User me-reply pesan ini: "${repliedMessage.text}"`;
        }

        const systemPrompt = `Kamu adalah Jack, asisten trading AI di grup Telegram. Santai, asik, gaul, cerdas.
        
        KONTEKS:
        1. ${repliedContext}
        2. Data histori trading terbaru: ${historyContext}
        
        ATURAN:
        - Jika user mengirim gambar/chart, analisa bentuk candlestick, trend, dan prediksi arah selanjutnya secara singkat.
        - Jawab dengan bahasa Indonesia gaul yang santai.`;

        let groqMessages = [];
        let groqModel = "";

        if (imageFileId) {
            groqModel = "qwen/qwen3.8-27b"; // <--- MODEL VISION YANG DIDUKUNG GROQ
            
            const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${imageFileId}`);
            const fileData = await fileRes.json();
            if (!fileData.ok) throw new Error("Gagal mengambil info gambar dari Telegram.");
            
            const filePath = fileData.result.file_path;
            const imgRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
            const imgBuffer = await imgRes.arrayBuffer();
            
            let binary = '';
            const bytes = new Uint8Array(imgBuffer);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Image = btoa(binary);
            
            groqMessages = [
                { role: "system", content: systemPrompt },
                { 
                    role: "user", 
                    content: [
                        { type: "text", text: userText },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                    ] 
                }
            ];
        } else {
            groqModel = "openai/gpt-oss-120b";
            groqMessages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ];
        }

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: groqModel, 
            messages: groqMessages,
            temperature: 0.6,
            max_tokens: 1024
          })
        });

        const groqData = await groqResponse.json();
        if (!groqResponse.ok) throw new Error(`Groq Error: ${JSON.stringify(groqData.error || groqData)}`);

        const replyText = groqData.choices[0].message.content;
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
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
