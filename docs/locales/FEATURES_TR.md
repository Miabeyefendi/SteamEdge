[← README'ye dön](../../README.md)

# ✨ Öne çıkanlar

- **Kart düşürme** - Oyunlarını "oynanıyor" gösterir, ticari kartlar düşer. Yedi mod var; biri, kart düşürmesi kısıtlı hesaplarda Steam'in kart düşürmeye ancak oyun bir süre eşiğini (genelde iki saat) geçince başladığını bilir.
- **Saat yükseltici** - Aynı anda 32 oyuna kadar açık tutar. İsteğe bağlı saat eşitlemesi seçili oyunları aynı toplam süreye çeker.
- **Başarım yöneticisi** - Kilitli ve açık durumu doğrudan Steam protokolünden okur, toplu açar ya da yeniden kilitler.
- **Gerçekçi Mod** - Tek oyunu açık tutar ve başarımlarını en yaygından en nadire doğru, süreye yayarak açar. Profilde gerçekten oynanmış gibi bir iz bırakır.
- **Envanter ve pazar** - Gerçek satış geçmişi, sipariş defteri, toplu ortalama fiyat ve satış. Hepsi hesabın cüzdan kurunda. Satış fiyatı Steam'in kendi ücret hesabıyla belirlenir; toplu satış Steam'in hesap başına sınırına gelince durup söyler ya da satışı partilere böler. Aktif ilanlar geri alınabilir, booster paketleri aynı sayfadan açılır. Bir seçici, diğer oyunların eşyalarına (Counter-Strike 2, Dota 2 ve daha fazlası) aynı araçlarla geçer.
- **Ürün anahtarları** - Anahtar listesini yapıştır; arka planda tek tek etkinleştirilir. Steam'in saatlik sınırına gelince kuyruk bekler ve kendiliğinden sürer. Bir hesabın zaten sahip olduğu anahtar diğer hesaplarında denenebilir, ücretsiz bir oyun mağaza bağlantısından eklenir.
- **Sohbet** - Arkadaş listesi, yazışma ve mesaj gönderme, aynı ağ protokolü üzerinden. Okunmamış sayısı sekmede görünür, kuyruk çalışırken gelen mesaj kaçmaz.
- **Çoklu hesap** - Birden çok hesap aynı anda bağlı, her biri arka planda çalışır, ilerleme kaybolmadan geçiş yapılır. İstatistikler hesap başına tutulur.
- **Zamanlayıcı, vekil ve anahtar koruması** - Kart düşürme ve Gerçekçi Mod bir saat aralığında kendiliğinden çalışabilir, her hesap kendi HTTP ya da SOCKS5 vekilini kullanabilir (girişin de bir vekili vardır) ve kayıtlı giriş anahtarları Windows DPAPI ile şifrelenebilir.
- **Listeler ve süzgeçler** - Kart düşürme için kalıcı kara liste ve beyaz liste, iade süresindeki oyunları dışarıda bırakan bir süzgeç, listelerin başında duran favori oyunlar ve envanterin CSV olarak dışa aktarımı.
- **Tema ve dil** - Koyu, Gece Moru ve Beyaz tema, giriş ekranı dahil. Türkçe, İngilizce, Almanca, İspanyolca, Geleneksel Çince ve Rusça. Yeni kurulumlar İngilizce başlar.
- **Ekrana uyar** - Yerleşim 900 x 560'a kadar akışkandır: listeler kenardan taşmak yerine alt satıra geçer, dar pencerede yan menü kendiliğinden kapanır, kısa pencerede arayüz sıkışık moda geçer. Pencere kaldığı yerde, hâlâ var olan bir ekranda açılır. 900 x 560'tan küçük pencerelerde sayfanın tamamı pencereyle birlikte küçülür (675 x 420'ye kadar), düğmeler biçimini korur.
- **Modüler** - Kullanmadığın sayfaları kapat (kart, saat, envanter, başarım, anahtar, sohbet), kalanları kendi sıranda diz. Kapalı sayfa Steam'den hiçbir şey istemez. Hafif mod zayıf bilgisayarlar için animasyon ve bulanıklığı kapatır, otomatik ayar bunu senin yerine seçer. Küçük özellikler (etkinlik kutusu, favori yıldızları, İlanlarım ve CSV düğmeleri) ve üst çubuk öğeleri (arama, bildirimler, güncellemeler) de kapatılabilir.
- **Kaldığı yerden sürer** - Uygulama kapanırken, bilgisayar kapanırken ya da uygulama çökerken sürmekte olan bir kart düşürme, saat yükseltme ya da Gerçekçi Mod çalışması, hesap yeniden bağlanınca kaldığı yerden başlar. Uygulamanın çalışmadığı süre sayılmaz: üç saati kalan bir yükseltme yine üç saat sürer.
- **Okunaklı ve klavye dostu** - Yüzde 80 ile 150 arası arayüz ölçeği (Ctrl + / - / 0 ile de), sistemin karşıtlık ayarını izleyen Yüksek karşıtlık teması, 4,5 : 1 ya da daha iyi okunan ve 11 pikselden küçük olmayan metin, klavyeyle ve ekran okuyucuyla çalışan anahtarlar ile yan menü.
- **Hızlı gezinme** - Ctrl+K, yazdıkça sayfaları, ayarları, hesapları ve açık sayfanın işlemlerini bulan bir komut paleti açar; Ctrl+1 ile Ctrl+9 sayfaları numarayla açar, ? kısayolları listeler, Ayarlar'ın kendi arama kutusu vardır ve değiştirip kaydettiğin bölümleri işaretler.
- **Steam istemcisi gerekmez** - Steam'in kendi ağ protokolüyle konuşur. İstemci hiç açılmaz, gerekmez de.
- **Taşınabilir** - Çıkar ve çalıştır. Kurulum yok, kayıt defterine dokunulmaz, her şey exe'nin yanında durur.

## 📸 Ekran görüntüleri

<div align="center">

| | |
|:-:|:-:|
| <img src="../../design/screenshots/CardFarming.png" alt="Kart Düşür"><br><sub>Kart Düşür</sub> | <img src="../../design/screenshots/HourBoostr.png" alt="Saat Yükseltici"><br><sub>Saat Yükseltici</sub> |
| <img src="../../design/screenshots/Achievements.png" alt="Başarımlar"><br><sub>Başarımlar</sub> | <img src="../../design/screenshots/RealisticMode.png" alt="Gerçekçi Mod"><br><sub>Gerçekçi Mod</sub> |
| <img src="../../design/screenshots/RealisticModeAdvanced.png" alt="Gerçekçi Mod, gelişmiş"><br><sub>Gerçekçi Mod, gelişmiş</sub> | <img src="../../design/screenshots/Market.png" alt="Envanter & Pazar"><br><sub>Envanter & Pazar</sub> |
| <img src="../../design/screenshots/Market2.png" alt="Pazar, sipariş defteri"><br><sub>Pazar, sipariş defteri</sub> | <img src="../../design/screenshots/Chat.png" alt="Steam sohbeti"><br><sub>Steam sohbeti</sub> |
| <img src="../../design/screenshots/SettingsGeneral.png" alt="Ayarlar"><br><sub>Ayarlar</sub> |  |

**Temalar: Koyu, Gece Moru, Beyaz (Ayarlar > Genel > Tema)**

| Koyu | Gece Moru | Beyaz |
|---|---|---|
| <img src="../../design/screenshots/themes/overview-dark.png" alt="Koyu"> | <img src="../../design/screenshots/themes/overview-midnight.png" alt="Gece Moru"> | <img src="../../design/screenshots/themes/overview-white.png" alt="Beyaz"> |
| <img src="../../design/screenshots/themes/login-dark.png" alt="Koyu"> | <img src="../../design/screenshots/themes/login-midnight.png" alt="Gece Moru"> | <img src="../../design/screenshots/themes/login-white.png" alt="Beyaz"> |

</div>
