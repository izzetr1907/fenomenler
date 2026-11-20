# Fenomenler 📱

Tüm sosyal medya fenomenleri tek uygulamada. Instagram tarzı, mobil öncelikli, yüklenebilir (PWA) web uygulaması.

## Özellikler
- **Ana akış**: takip ettiğin fenomenlerin en son YouTube videoları, Instagram tarzı kartlar, üstte hikâye (story) şeridi, uygulama içinde video oynatma
- **Keşfet**: isim / kategori / @kanal ile arama, önerilen fenomenler, son videolar ızgarası
- **Fenomen profilleri**: avatar, biyografi, YouTube / Instagram / TikTok bağlantıları, video ızgarası, takipçi sayısı
- **Hesaplar**: e-posta + şifre (bcrypt), HttpOnly oturum çerezi, takip et / takipten çık
- **YouTube bildirimleri**: her kanal `https://www.youtube.com/feeds/videos.xml?channel_id=…` RSS beslemesiyle `POLL_MINUTES` dakikada bir taranır (API anahtarı gerekmez). Yeni video → takipçilere uygulama içi bildirim + Web Push (VAPID, service worker)
- **Mesajlaşma**: kullanıcı ↔ fenomen DM; fenomen hesabı gelen kutusundan yanıtlar; yeni mesajda push bildirimi
- **Fenomen ol**: YouTube @kanal adını girerek profil oluştur (isim, foto, kanal ID otomatik çözülür) veya mevcut profili, YouTube kanal açıklamasına doğrulama kodu ekleyerek sahiplen

## Çalıştırma
```bash
npm install
npm start          # http://localhost:3000
```
Ortam değişkenleri: `PORT`, `DATA_DIR` (SQLite + anahtarlar, varsayılan ./data), `POLL_MINUTES` (5), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (yoksa otomatik üretilip data/vapid.json'a yazılır), `ADMIN_KEY` (manuel tarama: `POST /api/admin/poll?key=…`).

## Sınırlamalar
- Instagram ve TikTok'un yeni gönderiler için ücretsiz/açık bir API'si yok; bu yüzden otomatik bildirim yalnızca YouTube için. Instagram/TikTok profilleri bağlantı olarak gösterilir.
- Render ücretsiz katmanında disk geçicidir: her yeniden başlatmada SQLite verisi (hesaplar, takipler, mesajlar) sıfırlanır. Kalıcılık için Render Disk (`DATA_DIR`) veya Postgres kullanın.
- iPhone'da Web Push yalnızca uygulama "Ana Ekrana Ekle" ile yüklendiğinde çalışır (iOS 16.4+).
