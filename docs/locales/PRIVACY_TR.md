[← README'ye dön](../../README.md)

# 🔐 Güvenlik ve Steam girişin

> [!WARNING]
> **SteamEdge Steam hesabın adına işlem yapabilir: kart toplar, saat yükseltir, başarım açar, pazarda eşya satar. Aşağıda girişinle tam olarak ne yaptığını, nerede sakladığını ve ağa ne gönderdiğini yazdım; rahat edip etmeyeceğine sen karar ver.**

| Ne | Ne oluyor |
|---|---|
| **Parola** | Giriş ekranına yazılır ve HTTPS üzerinden doğrudan Steam'in kendi giriş servisine verilir. Yalnızca o çağrı boyunca bellekte durur. **Diske asla yazılmaz**, günlüğe de yazılmaz. |
| **Steam Guard kodları** | Steam'e bir kez gönderilir ve atılır. Saklanmaz. Uygulama doğrulayıcı sırlarını tutmaz (eski maFile özelliği 1.1.9'da kaldırıldı), bu yüzden mobil onayları senin yerine veremez. |
| **Oturum anahtarı** | Giriş sonrası Steam uygulamaya yenileme anahtarı verir, böylece tekrar sormaz. Bu parolan değildir. exe'nin yanındaki `settings/session.json` ve `settings/accounts.json` içinde durur. **Varsayılan olarak düz metindir.** *Ayarlar > Gizlilik & Güvenlik > Giriş anahtarlarını şifrele* açılırsa Windows DPAPI ile mühürlenir; bu bilgisayarda yalnızca senin Windows kullanıcın okuyabilir. Web çerezleri yalnızca bellekte durur. |
| **Çerezle giriş (yedek yol)** | Normal giriş yerine çerezle girersen `settings/web-session.json` bu çerezleri çıkış yapana kadar düz metin tutar. |
| **Günlük dosyası** | `cache/steamedge.log` olayları tutar; parola, anahtar ya da çerez yazılmaz. |
| **Dışa aktarma** | Ayar dışa aktarımı anahtarları, vekil adreslerini (parolalarıyla) ve ebeveyn PIN'ini dışarıda bırakır. |

**Ağa ne gidiyor**

- **Steam'in kendisi**: Steam istemcisinin kurduğu aynı bağlantılar (giriş, sohbet, "oynuyor" durumu), `steam-user` ve `steam-session` kütüphaneleriyle.
- **`steamcommunity.com`**: envanter, pazar, ilanlar ve başarım sayfaları, senin oturumunla.
- **`api.steampowered.com`**: giriş ve oturum çağrıları.
- **`*.steamstatic.com`**: oyun görselleri ve Steam'in kendi pazar ücret betiği (Node erişimi olmayan, gizli ve korumalı bir pencerede çalışır).
- **`api.github.com`**: açılışta bir kez ve güncelleme düğmesine basınca, herkese açık sürüm listesini okumak için. Senin hakkında hiçbir şey göndermez, hiçbir şey indirmez ya da kurmaz.
- **Kendi vekil sunucun**, yalnızca hesap başına ya da giriş için bir tane girdiysen.
- Başka hiçbir şey yok. **Benim bir sunucum, analiz, telemetri, çökme raporu, reklam yok.** Yazı tipleri uygulamanın içinde olduğu için yazı tipi sunucusuna da gidilmez.

**Satış**: ilanlar Steam pazarına web sitesindeki gibi gider. Mobil doğrulayıcı açıksa her ilan Steam uygulamasındaki onayını bekler ve SteamEdge bu onayı veremez. Uygulama istekleri aralıklı gönderir (en az 1,5 saniye) ve aynı eşyayı iki kez göndermez.

**Uygulama penceresi nasıl kilitli**: yalnızca kendi dosyalarını yükler, web sayfası açamaz ve içinde Node erişimi kapalıdır (bağlam yalıtımı ve İçerik Güvenlik Politikası).

**Bunları kendin nasıl denetlersin**: kod açık (AGPL-3.0), her değişiklik CodeQL ile taranır, her sürüm dosyasının SHA-256 değeri yayımlanır ve `npm run build` ile kendin derleyebilirsin.

**Kendini koru**
- `settings/` klasörünü kimseyle paylaşma (zip, ekran görüntüsü, destek isteği). İçinde anahtarın olabilir.
- Anahtar şifrelemeyi aç (yukarıda) ve bir bilgisayarda işin bitince *Çıkış Yap*'ı kullan.
- Kayıtlı tüm oturumları kesmek için Steam Guard ayarlarındaki Steam'in kendi *diğer tüm cihazlardan çıkış* seçeneğini kullan.

**Dürüst sınırlar**: bu, tek kişinin kişisel projesi; Valve tarafından yapılmadı, onunla bağlantısı yok ve bir hesabı otomatikleştirmek Steam kurallarına aykırı olabilir. Kullanım riski sana ait.

## 🛡️ Güvenlik

Bir açık mı buldun? Herkese açık bir issue açma. [SECURITY.md](../../SECURITY.md)
içindeki gizli bildirim yolunu izle.
