const fs = require("fs");
const path = require("path");

const authDir = path.join(__dirname, ".baileys_auth");

if (!fs.existsSync(authDir)) {
  console.log("❌ .baileys_auth dizini bulunamadı.");
  process.exit(1);
}

const files = fs.readdirSync(authDir);
console.log(`🔍 .baileys_auth içinde ${files.length} dosya bulundu.`);

let deletedCount = 0;
for (const file of files) {
  if (file !== "creds.json") {
    try {
      fs.unlinkSync(path.join(authDir, file));
      deletedCount++;
    } catch (err) {
      console.error(`⚠️ ${file} silinemedi:`, err.message);
    }
  }
}

console.log(`🧹 Başarıyla ${deletedCount} önbellek dosyası silindi. creds.json korundu!`);
