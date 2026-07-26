const fs = require("fs");
let code = fs.readFileSync("whatsapp-bot/index.js", "utf8");

const webhookCode = `
      // 📢 MANUEL CEVAP WEBHOOK'U (Realtime'a güvenmemek için)
      app.post('/webhook/response', async (req, res) => {
        try {
          const { complaintId, responseText: manualText } = req.body;
          if (!complaintId || !manualText) {
            return res.status(400).json({ status: 'error', reason: 'Missing payload' });
          }

          console.log(\`\\n   🔌 Webhook (Manuel Cevap) tetiklendi! Şikayet ID: \${complaintId}\`);

          const { data: complaint, error: compError } = await supabase
            .from('complaints')
            .select('citizen_phone, citizen_name, status, source')
            .eq('id', complaintId)
            .single();

          if (compError || !complaint) {
            return res.status(404).json({ status: 'error', reason: 'Complaint not found' });
          }

          if (complaint.source !== 'whatsapp_qr') {
            return res.json({ status: 'ignored', reason: 'Not whatsapp_qr' });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res.status(500).json({ status: 'error', reason: 'Bot not connected' });
          }

          let jid = complaint.citizen_phone.includes('@')
            ? complaint.citizen_phone
            : \`\${complaint.citizen_phone}@s.whatsapp.net\`;

          const myJid = activeSock.user?.id;
          if (myJid) {
            const myBareId = myJid.split(':')[0].split('@')[0];
            if (complaint.citizen_phone === myBareId) jid = myJid;
          }

          const exactJid = global.activeJids.get(complaint.citizen_phone);
          if (exactJid) {
            jid = exactJid;
          }

          const statusEmoji = complaint.status === 'cozuldu' ? '✅' : '📢';
          const statusText = complaint.status === 'cozuldu' ? 'ÇÖZÜLDÜ' : 'GÜNCELLENDİ';

          const msgText = 
            \`\${statusEmoji} *Alanya Belediyesi Bilgilendirme*\\n\\n\` +
            \`Sayın *\${complaint.citizen_name || 'Vatandaş'}*,\\n\` +
            \`Şikayetinizin durumu *\${statusText}* olarak güncellenmiştir.\\n\\n\` +
            \`*Belediye Birim Açıklaması:*\\n"\${manualText}"\\n\\n\` +
            \`Alanya Belediyesi olarak iyi günler dileriz. 🌟\`;

          console.log(\`   📤 Sohbet aktifleştiriliyor ve sendMessage çağrılıyor...\`);
          try {
            await activeSock.presenceSubscribe(jid);
            await new Promise(r => setTimeout(r, 500));
            await activeSock.sendPresenceUpdate('composing', jid);
            await new Promise(r => setTimeout(r, 1000));
            await activeSock.sendPresenceUpdate('paused', jid);
          } catch (e) {}

          const sent = await activeSock.sendMessage(jid, { text: msgText });
          console.log(\`   📬 sendMessage sonucu:\`, JSON.stringify(sent?.key || 'BOŞ'));
          console.log(\`   💬 Manuel Cevap Webhook aracılığıyla iletildi (\${complaint.citizen_phone})\`);
          
          res.json({ status: 'success', messageId: sent?.key?.id || 'unknown' });
        } catch (error) {
          console.error('⚠️ Webhook hatası:', error.message);
          res.status(500).json({ status: 'error', reason: error.message });
        }
      });
`;

code = code.replace(
  "// Zaten dinlemede olan bir express sunucusu varsa",
  webhookCode + "\n      // Zaten dinlemede olan bir express sunucusu varsa",
);
fs.writeFileSync("whatsapp-bot/index.js", code);
console.log("Fix applied");
