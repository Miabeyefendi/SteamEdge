# Ayarlar - hepsinin açıklaması

[English](../en/INSTRUCTIONS.md) · [Türkçe](../tr/INSTRUCTIONS.md) · [Deutsch](../de/INSTRUCTIONS.md) · [Español](../es/INSTRUCTIONS.md) · [繁體中文](../zh/INSTRUCTIONS.md)

Ayarları sağ üstteki dişli simgesiyle aç. Ayarlar **uygulama geneline** aittir, hesaba özel
değildir. Her satırda üzerine geldiğinde buradaki açıklamanın aynısını gösteren bir **?**
vardır.

Değişiklikler anında kaydedilir. **Varsayılana Sıfırla** ekranın üstündedir.

---

## Genel

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Uygulama dili** | Türkçe | English, Türkçe, Deutsch, Español, 繁體中文. Değiştirince uygulama yeniden yüklenir. |
| **Açılış sayfası** | Genel Bakış | Açılışta hangi sekmenin geleceği. |
| **Arayüz yoğunluğu** | Ferah | Sıkışık, satır yüksekliğini azaltır; ekrana yaklaşık üçte bir daha fazla satır sığar. |
| **Saat biçimi** | 24 saat | Oturum sayaçları, kayıt zamanları ve sessiz saatler için geçerli. |
| **Windows açılışında başlat** | Kapalı | Oturum açıldığında SteamEdge sessizce tepsiye açılır. |
| **Kapatınca sistem tepsisine küçült** | Kapalı | Pencereyi kapatmak kart toplamayı arka planda sürdürür. |
| **Uyku modunu engelle** | Kapalı | Kart toplama veya saat yükseltme sırasında bilgisayarın uykuya geçmesini ve ekranın kilitlenmesini engeller. |
| **Yan menü daraltılmış başlasın** | Kapalı | Sadece ikonlu yan menü; içerik alanı 128 piksel genişler. |

### Yedekleme

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Dışa / İçe Aktar** | - | Tüm tercihleri ve kalıcı istatistikleri tek bir `.json` dosyasına yazar. **Giriş anahtarları ve kayıtlı hesaplar bilerek dışarıda bırakılır**, bu yüzden dosyayı bulutta tutmak güvenlidir. |
| **Hatırlanan verinin saklama süresi** | 90 gün | Kuyruk sırası, kuyruktan çıkarılan oyunlar ve başarım günlüğü için geçerli. Süresi dolanlar açılışta silinir. Ayarların kendisi etkilenmez. |

### Tehlikeli bölge

**Tüm Veriyi Sil**, oturumu, kayıtlı hesapları, ayarları, istatistikleri ve fiyat
önbelleğini kaldırır ve giriş ekranına döner. Steam hesabına dokunulmaz. İki onay ister.

---

## Kart Düşürme

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Varsayılan öncelik modu** | Sıralı | Kart Düşür sekmesinin hangi modla açılacağı. |
| **Kuyruk varsayılan sıralaması** | Varsayılan | Kuyruğun açılışta hangi sütuna göre sıralı olacağı. |
| **Aynı anda maksimum oyun** | 10 | Kaç oyunun eşzamanlı açık sayılacağı. Steam istemcisinin bilinen üst sınırı 32'dir; bu sunucu tarafı bir davranıştır, uygulamada bir sınır yoktur. Düşük değer daha az kaynak kullanır. |
| **Oyun başına maksimum süre** | 5 dk | Bu süre dolduğunda kart düşmemiş olsa bile sıradakine geçilir. `0` sınırı kaldırır. |
| **Hata sonrası yeniden deneme** | 3 | Kopan Steam bağlantısının kaç kez yeniden kurulmaya çalışılacağı. Bekleme her denemede ikiye katlanır. |
| **Bağlantı koparsa otomatik yeniden bağlan** | Açık | İnternet veya Steam kesintisinden sonra oturumu geri açar ve kuyruğu sürdürür. |
| **Kartlar bitince sıradaki oyuna geç** | Açık | Kapalıyken her oyunu elle başlatman gerekir. |

### Otomasyon

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Otomatik Pazarda Satış** | Kapalı | Yeni düşen kartları ortalama fiyattan listeler. **Hesabını kalıcı olarak değiştirir** - varsayılan kapalı. |
| **Arka Planda Topla** | Kapalı | Pencere gizliyken saniyelik arayüz yenilemelerini atlar. Motor etkilenmez. |
| **Saat artarken başarım tetikle** | Kapalı | Kart toplarken kilitli başarımları aralıklarla açar. **Hesabını kalıcı olarak değiştirir.** |
| **Kart Düşünce Bildir** | Kapalı | Her kart için masaüstü bildirimi. |

---

## Pazar

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Varsayılan satış fiyatı** | Ortalama | Satış çubuğunun başlangıç stratejisi: ortalama, altına in, en ucuzla aynı, hemen sat ya da kendim. |
| **Alt sıralama miktarı** | 1 sent | "Altına in" stratejisinin en ucuz ilanın ne kadar altına ineceği. Küçük değer kârı korur, büyük değer satışı hızlandırır. |
| **Toplu satışta maksimum öğe** | 50 | Yüksek değer Steam tarafında geçici kısıtlamaya yol açabilir. |
| **Sipariş defteri derinliği** | 5 | Detay panelinin kaç fiyat kademesi listeleyeceği. |
| **Fiyat yenileme aralığı** | 15 dk | Envanter sekmesi açıkken fiyatların hangi aralıkla tazeleneceği. |
| **Fiyatları otomatik yenile** | Kapalı | Yukarıdaki aralığı devreye alır. |
| **Satış öncesi onay iste** | Açık | Listelemeden önce öğe sayısını, brütü ve neti gösterir. |
| **Satışta iki adımlı onay** | Kapalı | Toplu satışlarda Steam Guard mobil kodu ister. |
| **Fiyat düşüşü uyarısı** | Kapalı | Bir öğe son medyanının altına indiğinde haber verir. |

> **Fiyatlar her zaman Steam ile aynıdır.** Liste sütunlarında kur çevirisi ve komisyon
> kesintisi yoktur. Gösterilen tutar, Steam pazar sayfasındaki tutarın birebir aynısıdır.
> Steam kesintisinden sonra cüzdanına ulaşan net tutar, satış akışında ayrıca gösterilir.

---

## Envanter

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Varsayılan sıralama** | Değere göre | Tablonun açılışta hangi sütuna göre sıralı olacağı. |
| **Çift tıklama davranışı** | Detay panelini aç | Bir öğeye çift tıklandığında ne olacağı. "Hemen Sat" onay adımını atlar - dikkatli ol. |
| **Düşük değer eşiği** | 1 | Bunun altındaki öğeler soluk gösterilir, toplu seçimde göze çarpar. |
| **Satılamaz öğeleri gizle** | Kapalı | Kupon, hediye ve takas dışı öğeleri listeden çıkarır. |
| **Satılan öğeyi gizle** | Açık | Listelenen öğeler Beklemede bölümüne taşınır, aynı öğeyi iki kez listelemezsin. |
| **Oyuna göre grupla** | Kapalı | Gruplama açık olarak açılır. |
| **Sıkışık satırlar** | Kapalı | Satır yüksekliği 60 → 40 piksel. |

---

## Saat Yükseltici

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Varsayılan hedef süre** | 1 saat | Sekmenin hangi süreyle açılacağı. Sınırsız, sen durdurana kadar çalışır. |
| **Aynı anda maksimum oyun** | 32 | Bilinen üst sınır. Steam bunun üzerindeki oyunlara süre işlemez. |
| **Oyun başlatma aralığı** | 5 sn | Oyunlar hepsi birden değil, bu aralıkla sırayla başlatılır. |
| **Oyun listesini hatırla** | Açık | Seçimin sonraki açılışta hazır gelir. |
| **Süre dolunca otomatik durdur** | Açık | Kapalıyken oyunlar hedeften sonra da açık kalır. |
| **Oyun sırasını karıştır** | Kapalı | Her oturumda farklı sıra, süre dengeli dağılır. |
| **Saat yükseltirken kart toplamayı duraklat** | Kapalı | İki motorun Steam'e aynı anda yüklenmesini önler. |

### Saat eşitleme

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Saatleri eşitle** | **Kapalı** | Seçili oyunların toplam süresini kademe kademe eşitler. Bkz. [Kullanım](./TUTORIAL.md#saat-eşitleme). |
| **Hedef** | Seçililerin en yükseği | Ya da elle girilen saat, ya da kütüphanenin en yükseği. |
| **Elle hedef saat** | 100 | Yalnızca hedef "Elle girilen saat" iken kullanılır. |

---

## Başarımlar

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Açılış aralığı** | 1 saniye | İki açılış arasındaki bekleme. Gerçek gecikme bu değerin çevresinde rastgele değişir (±%40), böylece sabit bir ritim oluşmaz. Uzun seçenekler 90 dakikaya kadar çıkar. |
| **Varsayılan sıralama** | Varsayılan | Nadirliğe göre sıralama en az açılan başarımları öne alır. |
| **Güvenli mod** | Açık | Aralığı kullanarak tek tek açar. Açık bırak. |
| **Açılışları zamana yay** | Kapalı | Çok daha geniş rastgelelik - doğal görünür, çok daha uzun sürer. |
| **Tekli işlemde onay iste** | Açık | Kapalıyken çift tıkla anında değiştirebilirsin. |
| **Onay kutusunda "bir daha sorma" dedim** | Kapalı | Onay penceresini kapattıysan burada görünür. Kapatırsan pencere geri gelir. |

> Başarım açmak Steam hesabını kalıcı olarak değiştirir. Geri kilitlemek mümkündür ama
> özgün açılma tarihi geri getirilemez.

---

## Bildirimler

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Masaüstü bildirimlerini göster** | Açık | Ana anahtar. Kapalıyken aşağıdakilerin hiçbiri gösterilmez; uygulama içi kayıtlar sürer. |
| **Kart düşürme başladı / durdu** | Açık | Kart sayısını da içerir. |
| **Saat yükseltme başladı / durdu** | Açık | Başlangıç, hedefe ulaşma ve durma. |
| **Başarım açıldığında** | Açık | |
| **Hata oluştuğunda** | Açık | Bağlantı kopması, oturum reddi, satış hataları. Kapatılması önerilmez. |
| **Bildirim sesi** | Çıngırak | 23 ses, hepsi uygulama içinde üretilir - dosya yok, telif sorunu yok. Seçince çalar. |
| **Sessiz saat aralığı** | Kapalı | Belirlediğin aralıkta hiçbir bildirim gösterilmez, hatalar dahil. |

### Steam sohbeti

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Mesaj gelince bildir** | Açık | Steam'den yazan arkadaşların, uygulama arka planda çalışırken bile sana ulaşır. |
| **Otomatik yanıt gönder** | Kapalı | Sana yazana otomatik yanıt verir. |
| **Otomatik yanıt metni** | *(kısa bir uzakta mesajı)* | Boş bırakmak devre dışı bırakır. |
| **Aynı kişiye tekrar yanıt aralığı** | 1 saat | Art arda yazan birine spam yapmayı önler. |

---

## Gizlilik ve güvenlik

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Çevrimdışı görün** | Kapalı | Arkadaşların seni oynarken görmez; etkinlik profiline yayınlanmaz. |
| **Oyun adını gizle** | Kapalı | Çevrimiçi görünürsün ama hangi oyunun açık olduğu gizli kalır. |
| **Oturum zaman aşımı** | Asla | Bu kadar işlemsizlikten sonra oturumu kapatır. Çalışan kart toplama veya saat yükseltme sayacı sıfırlar. |
| **Satışta iki adımlı onay** | Kapalı | Toplu satışta Steam Guard kodu. Hesap ele geçirilirse envanteri korur. |

---

## İstatistikler

Kalıcı toplamlar: çalışma süresi, düşen kart, satılan kart, yükseltme süresi, en verimli
gün, ortalama satış ve kayıt başlangıcı. **İstatistikleri Sıfırla** hepsini temizler.

> XP ve rozet sayısı takip edilmez - Steam bunları arayüzsüz erişime açmıyor. Kart, satış
> ve süre verileri gerçek ölçümdür.

---

## Gelişmiş ve veri

| Ayar | Varsayılan | Ne yapar |
|---|---|---|
| **Kayıt seviyesi** | Sadece hata | Ayrıntılı seviye disk kullanımını belirgin artırır. Yalnızca sorun ararken kullan. |
| **Hata ayıklama kayıtlarını tut** | Kapalı | Tüm protokol trafiğini `cache/steamedge.log` dosyasına yazar. Hata bildirimine ekle. |
| **Donanım hızlandırma** | Açık | Kapatmak ekran kartı sürecini küçültür ve ölçümlerimizde bellek kullanımını yaklaşık 45 MB düşürdü; karşılığında çizim işlemciye biner. Görüntü bozulması veya donma yaşıyorsan da kapat ve yeniden başlat. |
| **Kullanılan bellek** | - | Tüm SteamEdge süreçlerinin toplamı, süreç kırılımıyla birlikte. Ölçümden gelir, tahmin değildir. |
| **API isteği aralığı** | 350 ms | Steam istekleri arasındaki en kısa süre. 350 ms altı geçici hız limitine takılabilir. |
| **Veri Klasörünü Aç** | - | `settings/` ve `cache/` klasörlerini barındıran klasörü açar. |
| **Fiyat Önbelleğini Temizle** | - | Tüm fiyatların yeniden çekilmesini sağlar. |

---

## Hesap kartı

Ayarlar'ın sağındaki panel. Steam seviyesi, bağlantı durumu ve giriş yapılmış hesabın tüm
kimlik biçimleri: **SteamID** (17 haneli olan), **SteamID2** (`STEAM_1:...`), **SteamID3**
(`[U:1:...]`), **hesap numarası**, **hex** ve profilde tanımlıysa **özel adres**. Herhangi
bir satıra tıklamak değeri panoya kopyalar. Özel adres dışındakiler SteamID'den yerelde
hesaplanır, Steam'e hiçbir şey sorulmaz; özel adres profil sayfasından okunur.

**Kimlikleri Kopyala** hepsini birden panoya alır, **Profili Aç** profili tarayıcıda açar.

---

## Güncelleme

SteamEdge yayın listesine **açılışta bir kez** bakar ve **yalnızca** yeni sürüm varsa
pencere gösterir. Sürümün güncelse hiçbir şey görünmez.

Üst çubukta zil ile dişli arasındaki indirme düğmesi aynı denetimi istediğin an tekrarlar;
orada sonuç her durumda söylenir, güncel olmak dahil.

Uygulama yalnızca sürüm numarasını okur. Hiçbir zaman kendini indirmez, kurmaz veya
değiştirmez - neyi ne zaman kuracağına sen karar verirsin. Yükseltirken: yeni arşivi
**boş ve yeni bir klasöre** çıkar, eski `settings/` klasörünü yanına kopyala.

---

## Hakkında

Sürüm, teşekkürler ve SteamEdge'e ilham veren projelerin bağlantıları. **Hiçbirinden kod
alınmamıştır** - bkz. [README](./README.md#teşekkürler).

---

## Önerilen başlangıç

Düşünmeden çalışmasını istiyorsan:

- Kart Düşürme: **Hızlı** mod, maksimum oyun **10**
- Başarımlar: **Güvenli mod açık**, aralık **1 saniye**
- Pazar: **Satış öncesi onay iste açık**
- Gizlilik: Fark edecek arkadaşların varsa **Çevrimdışı görün açık**
- Bildirimler: Uyku saatlerin için **Sessiz saatler açık**

---

Güvenlik, ban veya hatalarla ilgili sorular: [SSS](./FAQ.md).
