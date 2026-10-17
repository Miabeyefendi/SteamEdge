[← README'ye dön](../../README.md)

# ⚙️ Yapılandırma

Ayarlar exe'nin yanındaki `settings/settings.json` dosyasında, hesaba özel veriler ise `settings/accounts/<steamID>.json` içinde durur. Neredeyse hepsi uygulamadaki Ayarlar sayfasından ve özelliklerin kendi sayfalarından düzenlenebilir; dosyalara elle dokunmak için bir sebep yok. Ayarlar sayfasındaki değişiklikler yalnızca Kaydet'e basınca uygulanır, çalışan işler birkaç saniye içinde yeni değerlerle devam eder.

> **`settings/` klasörünü kimseyle paylaşma.** İçinde Steam oturum anahtarın var ve o anahtar hesabını kullanmaya yeter.

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `boostMaxGames` | `32` | Saat yükseltici aynı anda kaç oyunu açık tutar |
| `boostSync` | `false` | Seçili oyunları aynı toplam süreye çeker |
| `fetchAvgWithPrice` | `true` | Bir eşyanın ortalamasını fiyatıyla aynı turda çeker |
| `pauseFarmOnBoost` | `false` | Saat yükseltici ya da Gerçekçi Mod çalışırken kart düşürmeyi duraklatır |
| `bulkSellLimit` | `50` | Toplu satış bu kadar öğelik partilere bölünür; `0` Steam durdurana kadar listeler |
| `priceDropThreshold` | `10` | Steam'in 24 saatlik ortalamasının yüzde kaç altı fiyat düşüşü sayılır |
| `reconnectPolicy` | `unlimited` | Bağlantı koparsa yeniden bağlanma: `unlimited`, `10`, `3` ya da `off` |
| `sessionTimeout` | `never` | Bu kadar dakika işlem yapılmazsa tüm oturumları kapatır; çalışan işler boşta sayılmaz |
| `theme` | `dark` | Renk teması: `dark`, `midnight`, `white` |
| `language` | `en` | Arayüz dili: `tr`, `en`, `de`, `es`, `zh`, `ru` |

[Yapılandırma başvurusu](./TUTORIAL_TR.md#️-yapılandırma-başvurusu) bilinmeye değer anahtarları kapsar; geri kalanı Ayarlar sayfasındaki diğer denetimlerdir.
