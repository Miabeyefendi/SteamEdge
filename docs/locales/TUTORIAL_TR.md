<div align="center">

# 📖 SteamEdge Rehberi

[English](../guides/TUTORIAL.md) · **Türkçe** · [Deutsch](./TUTORIAL_DE.md) · [Español](./TUTORIAL_ES.md) · [简体中文](./TUTORIAL_ZH.md) · [Русский](./TUTORIAL_RU.md)

[README'ye dön](./README_TR.md) · [Sürüm notları](../../CHANGELOG.md)

</div>

---

## 📑 İçindekiler

- [Genel bakış](#-genel-bakış)
- [Kurulum](#-kurulum)
- [Arayüz turu](#️-arayüz-turu)
- [Özellik başvurusu](#-özellik-başvurusu)
- [Yapılandırma başvurusu](#️-yapılandırma-başvurusu)
- [Sorun giderme](#-sorun-giderme)
- [Sık sorulanlar](#-sık-sorulanlar)
- [Sözlük](#-sözlük)

---

## 🔭 Genel bakış

### Ne yapar

SteamEdge, Steam oyunlarını çalıştırmadan "çalışıyor" gösterir. Ticari kart toplar, oynanma süresi biriktirir, başarımları okur ve yazar, envanterini gerçek pazar verisiyle fiyatlandırır. Bunların hepsi normalde Steam istemcisinin açık olmasını ister; burada hiçbiri istemez.

### Nasıl çalışır

Uygulama, Steam'in kendi ağ protokolüyle konuşur; istemcinin kullandığı protokolün aynısı. Bir oturum anahtarıyla giriş yapar, Steam'e hangi oyunların oynandığını söyler, rozet sayfalarını, envanteri, pazar verisini ve başarım şemalarını geri okur.

Buradan iki sonuç çıkıyor ve uygulamanın davranışının çoğunu bu ikisi açıklıyor:

- **Tek doğru kaynağı Steam.** Hiçbir şey tahmin edilmez, uydurulmaz. Bir sayı çekilemiyorsa kutuda tahmin değil, tire görürsün.
- **Steam'in sınırları uygulamanın da sınırı.** Pazar istekleri hesap başına kabaca 30 saniyede 20 istekle sınırlı ve uygulamanın pazara dokunan her parçası bu tek bütçeyi paylaşıyor. Kart düşürme, bir oyunun toplam süresi iki saati geçmeden başlamıyor. Bunlar ölçülmüş gerçekler, ayar değil. İlan vermenin de Steam'in yayımlamadığı, hesaba göre değişen ayrı bir sınırı var.

### Dosya düzeni

Her şey exe'nin yanında durur. Kayıt defterine, `AppData` içine ya da `Program Files` altına hiçbir şey yazılmaz.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              genel ayarlar
    accounts.json              kayıtlı hesaplar
    session.json               aktif oturum anahtarı
    stats.json                 kalıcı istatistikler
    state.json                 hatırlanan kuyruklar ve başarım günlüğü
    accounts/<steamID>.json    hesaba özel: kuyruklar, presetler, istatistikler
  cache/
    prices.json                pazar fiyatları, 24 saat ömürlü
    history.json               gerçekleşen satış ortalamaları, 72 saat ömürlü
    basarimsiz.json            başarımı olmadığı anlaşılan oyunlar
    chromium/                  görsel ve sayfa önbelleği
    steamedge.log              hata bildirimine eklenecek kayıt
```

> **Hassas olan `settings/`.** `session.json` içinde hesabını kullanmaya yeten bir anahtar var. Paylaştığın bir yedeğe, yüklediğin bir arşive ya da ekran görüntüsüne girmesin.

---

## 📦 Kurulum

### Gereksinimler

Windows 10 ya da üstü, 64 bit. Steam Guard kurulu bir Steam hesabı. Çıkarılmış hâlde yaklaşık 330 MB disk alanı. Steam istemcisi gerekmez ve hiç açılmaz.

### Adım adım

1. [Yayınlar sayfasından](https://github.com/Miabeyefendi/SteamEdge/releases/latest) en son `.rar` dosyasını indir.
2. Kendi sahip olduğun bir klasöre çıkar. `Program Files` olmasın; uygulama ayarlarını kendi yanına yazıyor.
3. `SteamEdge.exe` dosyasını çalıştır.
4. Giriş yap. Kolay yol QR sekmesi: kodu Steam mobil uygulamasıyla okut ve onayla. Parola sekmesi kullanıcı adı, parola ve bir Steam Guard kodu ister.

### Kurulumu doğrulama

Oturum ayağa kalkınca sol altta `SİSTEM: HAZIR`, bir iş çalışırken `SİSTEM: ÇALIŞIYOR` yazar, sağ üstteki hesap rozeti adın, avatarın ve seviyenle dolar. Rozet boş kalıyorsa oturum kurulmamıştır; [sorun gidermeye](#-sorun-giderme) bak.

### Güncelleme

Uygulama yayımlanmış sürüm numarasına bakar ve daha yenisi çıktığında haber verir. Bilerek hiçbir şey indirmez, kurmaz. Güncellemek için SteamEdge'i kapat, yeni arşivi **boş ve yeni bir klasöre** çıkar ve eski klasördeki `settings/` klasörünü oraya kopyala. Uygulama açıkken eski klasörün üzerine çıkarmak iki sürümün dosyalarını karıştırır; uygulama yaygın durumu yakalar ve açılışta söyler.

### Kaldırma

Klasörü sil. İşlemin tamamı bu.

---

## 🖥️ Arayüz turu

### Genel Bakış

Açılış sayfası. **Aktif Görev** paneli gerçekten ne çalışıyorsa onu gösterir; aynı anda birden çok iş varsa aralarında oklarla gezilir. Başlat, Durdur ve Detay sabit bir sayfaya değil, o an baktığın işe göre çalışır.

Üstünde altı kutu: kalan toplam kart, kütüphane, bu oturum, envanter değeri, saat yükseltici ve başarımlar. Soldaki **Son aktiviteler** olanları durum ve saatle listeler; Aktif Görev panelinin altındaki **Hızlı işlemler** oyun listesini, envanteri ya da pazarı yeniler ve Ayarlar'ı açar. Bir kutu, sayfası henüz yüklenmediyse tire gösterir; bu, hesabın hakkında değil neyin çekildiği hakkında bir bilgidir.

### Kart Düşür

Rozet sayfalarından okunan, kartı kalmış oyunların kuyruğu; 1-2 ya da 3+ kart kalanlara göre süzülebilir. Oklarla ya da **En öne al** ile sırala, ✕ ile çıkar. Sağda: düşürme modu, hazır sürelerle oturum zamanlayıcısı, **Otomasyon** (düşen kartı pazarda otomatik sat, arka planda topla, kart düşünce bildir, saat artarken başarım tetikle) ve **Son düşüşler**. Başlat'a bas.

### Envanter & Pazar

Steam envanterin; kopyalar tek satırda birleşir, oyuna, ada, türe, duruma ve fiyata göre süzülür, istenirse oyuna göre gruplanır. **Fiyatları getir** ve **Ortalamaları getir** pazar verisini öğe öğe, iki değer birlikte çeker. Detay paneli satıştaki ilanları, anında satılabilecek fiyatı ve gerçekleşen satışları gösterir. Alttaki çubuk seçimi, brüt tutarı ve eline geçecek tutarı toplar; **Sat** öncesi satış modlarını sunar (ortalamadan, altına in, en ucuzla aynı, hemen sat, kendim).

### Saat Yükseltici

Solda aranabilir tüm kütüphane, ortada aktif kuyruk. Sağda: **Saat eşitleme** (hedef ve yöntem), eşzamanlı limit (2, 8, 16, 32 ya da özel), hazır süreler, davranış anahtarları ve çevrimdışı görünme. Süre seçilirse oturum süre dolunca durur; ∞ sen durdurana kadar sürer. Seçim hazır ayar olarak kaydedilebilir.

### Gerçekçi Mod

Oyunu, açılan sayıyı, ortalama aralığı ve genel ilerlemeyi gösteren bir şeridin altında üç sütunlu bir çalışma alanı. Solda kuyruk, oturum süresi ve OTO hedef; ortada sıradaki başarım üstte olmak üzere açılma sırası; sağda Basit ve Gelişmiş diye ikiye ayrılan ayarlar.

### Başarımlar

Her oyun için protokolden okunan gerçek kilitli ve açık durum; üstte toplamlar, durum ve nadirlik süzgeçleri, ızgara ya da liste görünümü ve detay paneli. Başarımları seçip toplu aç ya da yeniden kilitle; alttaki çubuk seçimi, tahmini süreyi ve güvenli modun açılışları aralıklandırıp aralıklandırmadığını gösterir. İlerleme canlıdır, Durdur beklemenin ortasında bile etki eder.

### Ayarlar

Uygulamaya söylenebilecek her şey, gruplanmış hâlde: Genel, Kart Düşürme, Pazar, Envanter, Saat Yükseltici, Başarımlar, Bildirimler, Gizlilik & Güvenlik, İstatistikler, Gelişmiş & Veri ve Hakkında. Sağ sütun hesabı (seviye, bağlantı durumu, kopyalanabilir Steam kimlikleri) ve yapılandırmayı (son kayıt, kaydedilmemiş değişiklikler) gösterir.

Değişiklikler **Kaydet**'e basana kadar sayfada bekler; öncesinde diske hiçbir şey yazılmaz ve kaydedilmemiş değişiklikle sayfadan çıkarken sorulur. Kaydet'ten sonra çalışan kart düşürme ya da saat yükseltme yaklaşık beş saniye duraklar ve aynı oyundan yeni değerlerle devam eder. **Sıfırla** varsayılanları sayfaya yükler, o da Kaydet'i bekler; uygulama dilini değiştirmez.

Tema (Koyu, Gece Moru, Beyaz) Genel bölümündedir, giriş ekranına da uygulanır.

### Sohbet

Sağ üstteki Sohbet düğmesinden açılır, yan menüden değil. Solda arkadaşlar, çevrimiçi olanlar üstte; sağda yazışma. Enter gönderir, Shift+Enter alt satıra geçer. Okunmamış sayısı hem arkadaş satırında hem üst çubuktaki düğmede görünür.

---

## 🧩 Özellik başvurusu

### Kart düşürme

Steam, bir oyunun toplam süresi **iki saati** geçmeden kart düşürmez. Bir mod dışında hepsi bunu yok sayıp oyunları çalıştırır; **Hızlı mod** bunu bilir ve yalnızca eşiği geçmiş oyunları döndürür, böylece henüz kart düşüremeyecek oyunlara zaman harcanmaz.

Kuyruktaki her oyunun kartı bittiğinde ya da **Oyun bitince sıradakine geç** kapalıyken mevcut oyun bittiğinde, kart düşürme son oyunu yeniden başlatmak yerine durur ve sebebini söyler. Kart düşürme ve saat yükseltici birlikte çalışabilir: her biri kendi oyun kümesini tutar, Steam ikisini birden 32 sınırına kadar görür.

Modlar:

| Mod | Ne yapar |
|---|---|
| Sıralı | Liste sırasıyla, teker teker |
| Çok Kart | En çok kartı kalan oyunlar önce |
| Az Kart | Bitmeye en yakın oyunlar önce |
| Öncelik | Senin belirlediğin sıra |
| Hızlı | Yalnızca iki saati geçmiş oyunlar, kısa aralıklarla döndürülür |

Kartlar bir programa göre gelmez ve Steam "kart düştü" diye bir olay yollamaz. Uygulama kalan kart toplamını düzenli ölçer ve uydurma bir sayaç yerine dürüst farkı bildirir.

### Saat yükseltici

Aynı anda 32 oyuna kadar çalıştırır. Steam süreyi açık olan her oyuna ayrı ayrı işler, yani 32 oyun bir saat açık kalırsa 32 saat oynanma süresi olur.

**Saat eşitlemesi** seçimi aynı toplama çeker. İki yöntem var:

- **Hepsi birden** - seçili oyunların tamamı aynı anda çalışır, hedefe ulaşan listeden düşer. Mümkün olan en hızlı yol: işin tamamı, en geride kalan oyun kadar sürer.
- **Sıralı** - en geride kalan oyun tek başına öne çekilir, bir sonrakine yetişince ikisi birlikte devam eder. Daha yavaş, ama oyunlar yol boyunca birbirine denk kalır.

İlerleme çubukları ortak bir zaman çizelgesine oturur: çubuk, oyunun kalan süresinin işin toplam süresine oranının bir eksiğidir. Otuz beş saatlik bir işte dört saat sonra bitecek oyunun çubuğu baştan neredeyse doludur, sona kadar sürecek olanınki boştur. Her biri hedefe ulaştığı anda tam %100 olur.

### Başarımlar

Başarımlar herkese açık profilin kazınmasıyla değil, protokol üzerinden okunup yazılır. Profilin gizli olması hiçbir şeyi değiştirmez.

İki tür başarıma dokunulamaz ve uygulama ikisini de tekrar tekrar denemek yerine şemadan tanır:

- **Korumalı başarımları** oyun sunucusu yazar. Steam bunu deneyen her istemciyi reddeder.
- **Bu protokolde istatistik tutmayan oyunlar** (bazı büyük çok oyunculu yapımlar) `0 / N` bildirir. Bu doğru bir sonuçtur, hata değil.

Bazı oyunlar başarım yazarken oyunun açık olmasını ister. Uygulama yazma sırasında oyunu açar, sonra öncesinde ne çalışıyorsa ona döner.

### Gerçekçi Mod

Tek oyunu açık tutar ve başarımlarını oturum boyunca, en yaygından en nadire doğru açar. Amaç bıraktığı iz: bir dakikada yüzlerce başarımın açılması hem profilde hem üçüncü parti sitelerde hemen göze çarpar.

**%100 bitiş süresi** bütün sayfanın üzerine kurulduğu sayıdır: bu oyunu bütün başarımlarıyla bitirmek kaç saat sürer. Girersen o oyun için hatırlanır. Boş bırakırsan oyun türünden tahmin edilir, ama o tahmin senin oynadığın süreye dayanır ve çok oynadığın oyunlarda şişer.

**Hedef sayı** iki parçadan çıkar: bu kadar oynanmışken açılmış olması gereken sayı eksi gerçekten açılmış olan, artı bu oturumun kendi payı. Panel hesabı yazar, denetleyebilirsin.

**Dağıtım modeli** aralıkların biçimini belirler. Doğrusal eşit dağıtır, üstel gerçek bir oyuncunun ilk saatleri gibi öne yükler, Pareto çoğunu ilk beşte bire koyar.

**Ritim** nadirliğe göre ağırlıklandırılır. Yalnızca %5 altındaki başarımlar belirgin biçimde uzun bekler, üstündeki her şey eşit ve hızlı akar. Bitiş süresini geçmiş bir oyunda çizelgenin tamamı sıkışır, çünkü taklit edilecek bir öğrenme eğrisi kalmamıştır.

**Başarımı olmayan oyunlar** anlaşıldığı anda kuyruktan düşer, `cache/basarimsiz.json` dosyasına yazılır ve bu sayfada bir daha önerilmez. Steam'in yayımladığı kütüphane bayrağı güvenilir değil; yalnızca şema isteği güvenilir.

### Envanter ve pazar

Eşya değeri, en düşük aktif ilan değil, **gerçekleşen satışların miktar ağırlıklı medyanıdır**. Tek bir kişinin bir kartı 999.999'a listelemesi değeri kaydırmaz.

Fiyatlar hesabının **cüzdan kurunda** gelir ve aynen o kurda gösterilir. Çeviri bilerek yok: çevirmek bir kur uydurmak demek olurdu.

Fiyat ve satış ortalaması **öğe başına, birlikte** çekilir, sonra kuyruk sıradaki öğeye geçer. İkisi Steam'in tek pazar bütçesini paylaşır ve limit öğe sayısıyla değil istek sayısıyla ölçülür. İstekler arasındaki süre Ayarlar > Gelişmiş & Veri altında; Steam'in toleransı hesaba göre değişir.

**Satış.** Alıcının ödeyeceği fiyatı sen seçersin; eline geçecek tutarı Steam'in kendi ücret betiği hesaplar (Steam'den indirilir, kum havuzlu bir pencerede çalışır), yani ikisi Steam sitesinin göstereceğiyle aynıdır. Toplu satış Steam bir ilanı reddettiği anda durur ve pencere Steam'in sebebini yazar: yeni hesaplar 10-15 ilanda durdurulabilir, eskileri 80 ve üzerini listeler. **Parti büyüklüğü** ve **Partiler arası bekleme** (Ayarlar > Pazar) büyük satışı böler; bekleme yoksa her partiden sonra sorulur. Mobil doğrulayıcı açıksa her ilan yine Steam uygulamasında onaylanmalıdır.

**Fiyat düşüşü uyarısı.** Bir öğenin en ucuz ilanı Steam'in 24 saatlik ortalamasının **Fiyat düşüşü eşiği** (varsayılan %10) kadar altına inince listede kırmızı ▼ ile işaretlenir, satış onayı kırmızı uyarı verir ve uyarı açıksa günde en fazla bir kez bildirim gelir.

### Sohbet

Arkadaş mesajları buradaki her şeyle aynı ağ protokolü üzerinden gider, Steam istemcisi işin içinde değildir. Yazışmayı açmak Steam tarafında okundu olarak işaretler, yazdığın kişi de "yazıyor" bilgisini görür.

**Grup sohbetleri kapsam dışı.** Protokolde ayrı bir kavram (chat room groups) ve ayrı bir ekran ister.

### Çoklu hesap

Aynı anda birden çok hesap bağlanabilir. Her biri kendi motorunu, kendi kuyruklarını ve kendi veri dosyasını tutar. Hesap değiştirmek uygulamayı yeniden başlatmaz ve diğer hesapların işini kesmez. Ayarlardan dışa aktarılan yedek her hesabın istatistiklerini, saat yükseltici listesini, Gerçekçi Mod kuyruğunu ve hazır ayarlarını içerir.

### Bağlantı

Bağlantı koptuğunda SteamEdge kendiliğinden yeniden bağlanır, çalışan işler kaldığı yerden sürer. **Bağlantı koparsa yeniden bağlan** (Ayarlar > Gelişmiş & Veri) sınırı belirler: sınırsız, 10 deneme, 3 deneme ya da kapalı. Steam oturumu kalıcı olarak kapatırsa (ör. hesap başka yerde açıldıysa) deneme durur ve şerit bir Yeniden bağlan düğmesi sunar.

---

## ⚙️ Yapılandırma başvurusu

Ayarlar `settings/settings.json` dosyasında durur. Aşağıdakilerin hepsi Ayarlar sayfasından düzenlenebilir.

### Genel

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `language` | `tr` | Arayüz dili: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Windows ile başlat |
| `theme` | `dark` | Renk teması: `dark`, `midnight` (Gece Moru), `white` |
| `preventSleep` | `true` | Kart düşürme, saat yükseltme ya da Gerçekçi Mod çalışırken bilgisayarın uykuya geçmesini engeller. Ekran yine kapanıp kilitlenebilir |

### Kart düşürme

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `autoNextGame` | `true` | Bir oyun bitince sıradakine geçer. Kapalı: kart düşürme mevcut oyundan sonra durur |
| `cardMaxGames` | `32` | Aynı anda açık oyun |
| `fastMinPlaytimeMin` | `120` | Hızlı mod bu sürenin altındaki oyunları atlar |
| `pauseFarmOnBoost` | `false` | Saat yükseltici ya da Gerçekçi Mod çalışırken kart düşürmeyi duraklatır, sonra kaldığı yerden sürdürür |

### Pazar

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `priceRefreshHours` | `24` | Çekilmiş bir fiyat kaç saat taze sayılır |
| `historyRefreshHours` | `72` | Satış ortalaması kaç saat taze sayılır |
| `fetchAvgWithPrice` | `true` | Ortalamayı fiyatla aynı turda çek. Kapalıyken öğe başına tek istek gider, ortalamalar yalnızca Ortalama düğmesiyle gelir |
| `bookDepth` | `5` | Detay panelindeki sipariş defteri satırı |
| `bulkSellLimit` | `50` | Toplu satış bu kadar öğelik partilere bölünür. `0` Steam durdurana kadar listeler |
| `sellBatchWaitMin` | `0` | Partiler arası bekleme (dakika). `0` her partiden sonra sorar |
| `priceDropThreshold` | `10` | Steam'in 24 saatlik ortalamasının yüzde kaç altı fiyat düşüşü sayılır |

### Saat yükseltici

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `boostMaxGames` | `32` | Aynı anda açık oyun |
| `boostDurationSec` | `3600` | Oturum süresi |
| `boostSync` | `false` | Seçimi ortak bir toplama çek |
| `boostSyncMode` | `highest` | Hedef: seçililerin en yükseği, elle girilen saat ya da kütüphanenin en yükseği |
| `boostSyncStrategy` | `parallel` | `parallel` hepsi birden, `staged` sıralı |
| `boostAutoRestart` | `false` | Süre dolunca kuyruğu yeniden başlat |
| `rememberBoostList` | `false` | Seçimi oturumlar arasında koru |

### Gerçekçi Mod

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `grDurationSec` | `7200` | Oturum süresi |
| `grModel` | `linear` | Dağıtım modeli |
| `grTcOyun` | `{}` | Oyun başına %100 bitiş süresi, saat cinsinden |
| `grCatchUp` | `true` | Geride kalan birikimi oturumun başına sıkıştır |
| `grHiz` | `1` | Tüm çizelge için hız çarpanı |
| `grUltraCarpan` | `3` | %5 altındaki başarımlar ne kadar uzun bekler |
| `grTelafiPay` | `20` | Telafi sıkışmasına ayrılan sürenin yüzdesi |
| `grBitmisSik` | `50` | Bitmiş oyunda çizelge hangi orana iner |
| `grKeepHours` | `true` | Başarımlar bitince saat toplamayı sürdür |
| `grSkipUltraRare` | `false` | %5 altındaki başarımları tamamen atla |

### Gizlilik

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `offlineMode` | `false` | Çalışırken çevrimdışı görün |
| `hideGameName` | `false` | Çevrimiçi olduğunu paylaş ama hangi oyunu değil |

> Çevrimdışı görünmek arkadaşlarının gördüğünü değiştirir. Steam'in seni oynuyor sayıp saymadığını da etkileyebilir; uzun bir oturumda buna güvenmeden önce dene.

### Gelişmiş

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `yenidenBaglanma` | `sinirsiz` | Bağlantı koparsa yeniden bağlanma: `sinirsiz`, `10`, `3`, `kapali` |
| `sessionTimeout` | `never` | Bu kadar dakika işlem yapılmazsa bağlantıyı keser. Çalışan işler boşta sayılmaz; sayacı yalnızca senin etkileşimin sıfırlar |
| `apiRequestDelayMs` | `350` | Pazar istekleri arasındaki en kısa süre. Düşük değer hızlıdır ama Steam'in hız sınırına (HTTP 429) yaklaştırır |
| `logLevel` | `error` | `cache/steamedge.log` içine ne yazılacağı: `off`, `error`, `warn`, `info`, `debug` |

### Ayarlar nerede durur

Genel ayarlar `settings/settings.json` içinde. Tek bir hesaba ait olan her şey (saat yükseltici seçimi, Gerçekçi Mod kuyruğu ve presetleri, başarım günlüğü, istatistikler) `settings/accounts/<steamID>.json` içinde. Önbellekler ayrı, `cache/` altında; yapılandırmayı kaybetmeden istediğin zaman silinebilir.

---

## 🔧 Sorun giderme

### Uygulama açılıp hemen kapanıyor

Zaten açık bir kopya var. SteamEdge tek örneğe izin verir. Görev Yöneticisi'nde `SteamEdge.exe` var mı bak, önce onu kapat.

### Hesap rozeti boş kalıyor, hiçbir şey yüklenmiyor

Steam oturumu kurulmamış. Bağlantı koptuğunda ya da yeniden denenirken üst çubuğun altında bir şerit çıkar. Sürüyorsa önce Steam'e erişilebildiğini doğrula, sonra sebebi için `cache/steamedge.log` dosyasına bak. Steam oturumu kalıcı olarak kapattıysa şerit bunu söyler ve bir Yeniden bağlan düğmesi sunar.

### Toplu satış yarıda durdu

Steam bir hesabın kaç ilan açabileceğini sınırlar; sınır hesabın yaşına, seviyesine ve güvenilirliğine göre değişir. Pencere Steam'in döndürdüğü sebebi yazar. Bekleyen ilanları Steam uygulamasında onayla, birkaç saat bekle ya da partiler arası beklemeyle daha küçük bir **Parti büyüklüğü** seç.

### "40 kart kaldı" yazıyor ama birkaç tane düştü

Kartlar ancak oyunun toplam süresi iki saati geçince düşer ve her oyunun düşecek kart sayısı sınırlıdır. Hepsi iki saatin altındaki oyunlarla geçen uzun bir oturum hiçbir şey üretmez; yalnızca eşiği geçmiş oyunları seçen Hızlı modu kullan.

### Fiyatlar tire gösteriyor ya da çok yavaş doluyor

Steam hesap başına kabaca 30 saniyede 20 pazar isteğine izin verir; bu bütçeyi fiyatlar, satış ortalamaları ve ilanlar paylaşır. Büyük bir envanter tasarım gereği zaman alır. `fetchAvgWithPrice` açıkken her öğe iki istek harcar, yani envanterin tamamı iki katı sürede dolar ama ortalamalar için ikinci bir tur beklemezsin.

### Bir başarım açılmıyor

Ya korumalıdır, yani onu oyun sunucusu yazar ve hiçbir istemci yazamaz, ya da oyun bu protokolde istatistik tutmuyordur. İkisi de tespit edilip bildirilir, tekrar denenmez. Toplu işlem üst üste üç başarısızlıktan sonra durur ve askıda kalmış gibi görünmek yerine sebebini söyler.

### Gerçekçi Mod yalnızca bir iki başarım öneriyor

Bitiş süresi fazla yüksek. Boş bırakılınca oynadığın süreden tahmin edilir, dolayısıyla uzun süre oynadığın bir oyun devasa uzunlukta bir oyun gibi okunur. Ana paneldeki kutuya gerçek %100 bitiş süresini gir.

### Hata bildirimi için kayıt toplama

Kayıt exe'nin yanındaki `cache/steamedge.log` dosyasıdır, Ayarlar'dan da açılır. Bağlantı olaylarını, kuyruk kararlarını ve hataları tutar. Parolanı ya da oturum anahtarını **içermez**, yani eklemek güvenlidir; yine de göndermeden önce göz at. Varsayılan olarak yalnızca hatalar yazılır; Ayarlar > Gelişmiş & Veri > **Kayıt dosyası** seçeneğini **Ayrıntılı (hata ayıklama)** yap, sorunu tekrarla ve dosyayı ekle.

---

## ❓ Sık sorulanlar

<details>
<summary><b>Steam istemcisi gerekiyor mu?</b></summary>

Hayır, hiç açmaz da.

</details>

<details>
<summary><b>Aynı anda birden çok hesap çalıştırabilir miyim?</b></summary>

Evet. Her biri kendi bağlantısını ve verisini tutar; sen başkasına bakarken arka plandaki hesaplar çalışmaya devam eder.

</details>

<details>
<summary><b>Otomatik güncelleme var mı?</b></summary>

Bilerek yok. Uygulama yayımlanmış sürüm numarasını okur ve yenisi çıkınca söyler. Hiçbir şey indirmez, hiçbir şeyi değiştirmez.

</details>

<details>
<summary><b>Neden her şey cüzdan kurumda?</b></summary>

Steam öyle gönderdiği için. Çevirmek bir kur uydurmak olurdu.

</details>

<details>
<summary><b>Kurulumumu başka makineye taşıyabilir miyim?</b></summary>

Klasörü kopyala, her şey içinde. `settings/` klasöründe oturum anahtarın olduğunu unutma, gizli kopyala. Ayarlar > Genel altındaki Yedekleme kutusu ayarları ve hesap verilerini oturum anahtarı olmadan tek dosyaya da aktarabilir.

</details>

---

## 📕 Sözlük

| Terim | Anlamı |
|---|---|
| **AppID** | Steam'in oyuna verdiği sayısal kimlik, örneğin Cyberpunk 2077 için 1091500 |
| **Rozet sayfası** | Bir oyunun kaç kart düşürme hakkı kaldığını listeleyen Steam sayfası |
| **Düşüş** | Oynanma süresi karşılığı verilen ticari kart |
| **market_hash_name** | Pazarın bir eşya için kullandığı tam ad |
| **Sipariş defteri** | Tek bir eşyanın canlı alım talimatları ve satış ilanları tablosu |
| **Korumalı başarım** | Yalnızca oyun sunucusunun yazabildiği, hiçbir istemcinin yazamadığı başarım |
| **Gerçekleşen satış** | Tamamlanmış işlem; aktif ilandan farklı |
| **Şema** | Steam'in bir oyunun başarım ve istatistik tanımı |
| **Oturum anahtarı** | Seni giriş yapmış tutan kimlik bilgisi. Parola gibi davran |
| **Tc** | %100 bitiş süresi: oyunu tüm başarımlarıyla bitirmek için gereken saat |

---

<div align="center">

[README'ye dön](./README_TR.md) · [Hata bildir](https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml)

</div>
