# SSS

[English](../en/FAQ.md) · [Türkçe](../tr/FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [繁體中文](../zh/FAQ.md)

---

## Güvenlik ve yasaklamalar

### Ban yer miyim?

Kimse yemeyeceğinin sözünü veremez. Kendi kararını verebilmen için işin gerçeği şu.

**SteamEdge ne yapar:** bir oyun başlattığında resmi Steam istemcisinin gönderdiği
`ClientGamesPlayed` mesajının aynısını gönderir. Steam oyunu çalışıyor görür ve kartları
normal şekilde düşürür. Mekanizmanın tamamı budur.

**Ne yapmaz:** oyun dosyası değiştirmez, hiçbir sürece enjeksiyon yapmaz, Steam Web API
anahtarı kullanmaz, başka oyunculara dokunmaz, senin adına takas veya hediye yapmaz ve
VAC korumalı oyunlarla hiçbir şekilde etkileşime girmez.

**Dürüst risk:** hesabını otomatikleştirmek
[Steam Abonelik Sözleşmesi'ne](https://store.steampowered.com/subscriber_agreement/)
aykırıdır. Bu tür araçlar on yılı aşkın süredir var ve kart toplama nedeniyle toplu
yasaklama yaşanmadı; ancak "yaşanmadı" ile "yaşanamaz" aynı şey değil. Valve politikasını
istediği zaman değiştirebilir. Bu riski kendin kabul edersin.

### VAC devrede mi?

Hayır. VAC yasakları, çalışan bir oyun sürecinde hile yapıldığında verilir. SteamEdge
hiçbir zaman bir oyun başlatmaz, dolayısıyla VAC'ın inceleyeceği bir süreç yoktur.

### İnsanların başını asıl ne yakıyor?

Kart toplamanın kendisi değil. Dikkat çeken şeyler:

- **Yüzlerce başarımı dakikalar içinde açmak.** Bu profilinde herkese açık ve üçüncü taraf
  siteler bunu takip ediyor. Güvenli modu ve gerçek bir aralık kullan.
- **Takas ve pazar suistimali** - bu uygulamanın yaptığı bir şey değil, ama kart toplamayı
  otomatikleştirenler çoğu zaman başka şeyleri de otomatikleştiriyor.
- **`settings/` klasörünü paylaşmak.** O klasörde giriş anahtarın var. Ona sahip olan
  sensin.

### Şifrem saklanıyor mu?

Hayır. QR ile girişte şifreni hiç yazmazsın. Şifreyle girişte bir kez anahtar almak için
kullanılır ve sonra atılır. Saklanan şey, Steam'in verdiği yenileme anahtarıdır ve
`settings/session.json` içinde tutulur.

`settings/` klasörünü bir şifre gibi düşün: yükleme, paylaşılan klasöre koyma, hata
bildirimine ekleme.

---

## Sık karşılaşılan sorunlar

### Windows "Windows bilgisayarınızı korudu" diyor

Çalıştırılabilir dosya kod imzası taşımıyor. Sertifika yılda birkaç yüz dolar tutuyor ve
ücretsiz bir hobi projesinde bu yok. **Ek bilgi → Yine de çalıştır**'a bas ya da
[kaynaktan kendin derle](./SETUP.md#kendin-derlemek).

### "SteamEdge ZATEN AÇIK" yazıyor ve uygulama kapanıyor

Aynı anda yalnızca bir kopya çalışabilir. İkisi birden çalışsaydı Steam ilk oturumu
düşürürdü (`LogonSessionReplaced`) ve sayfalar "Bağlı değil" gösterirdi. Açık pencereyi
kapat ve yeniden başlat.

### Başarımlar veya Envanter "Bağlı değil" gösteriyor

Steam oturumu başka bir giriş tarafından devralınmış. Genelde bu, aynı hesapta Steam
istemcisinin açık olduğu ya da SteamEdge'in başka bir kopyasının çalıştığı anlamına gelir.
Diğerini kapat ve **Tekrar Dene**'ye bas.

### Pazar kutularında "Steam istek limiti"

Steam hesap başına kabaca 30 saniyede 20 pazar isteğine izin verir. SteamEdge her şeyi tek
bir kapıdan sıraya alır, böylece istekler çakışmaz; yine de çok sayıda öğe detayını hızlıca
açarsan limite takılabilirsin.

Bir dakika bekle ve **Tekrar Dene**'ye bas. Kaçınmak için önce filtrele ve envanterin
tamamını yüklemek yerine **Fiyatları Getir**'i kullan.

### Fiyatlar yanlış görünüyor

Fiyatlar Steam cüzdanının kendi kurunda çekilir, Topluluk Pazarı'ndan okunur ve tam olarak
o kurda gösterilir. Hiçbir çeviri yoktur.

Bir sayı yanlış görünüyorsa hangi kutuyu okuduğunu kontrol et:

- **Satıştaki İlanlar** satıcıların istediği fiyattır ve saçma olabilir - biri tek parçayı
  999.999 dolara koyabilir.
- **Gerçekleşen Satışlar** öğenin gerçekten kaça satıldığıdır. Asıl değer budur.

### Kartlar düşmüyor

Sırayla kontrol et:

1. **Oyunun hâlâ kartı var mı?** Oyun Listesini Yenile'ye bas.
2. **Oyun 2 saati geçti mi?** Steam bundan önce kart düşürmez. Hızlı mod bunu otomatik
   halleder.
3. **Hesap uygun mu?** Steam, kart düşüşü alabilmesi için hesapta en az bir 5 dolarlık
   alışveriş yapılmış olmasını ister.
4. **Başka bir Steam oturumu karışıyor mu?** Steam istemcisini kapat.

### Uygulama çok bellek kullanıyor

Bu Electron: birden fazla süreç olarak çalışır, o yüzden Görev Yöneticisi'nde birkaç
SteamEdge satırı görürsün. Ayarlar → Gelişmiş → **Kullanılan bellek** hepsini senin için
toplar ve hangi sürecin ne tuttuğunu gösterir. Bizim makinede tipik bir oturum toplam
200-240 MB.

İki şey bunu düşürür:

- **Donanım hızlandırmayı kapatmak** (Ayarlar → Gelişmiş). Ekran kartı süreci küçülür;
  ölçümümüzde toplam 212 MB'tan 163 MB'a indi. Çizim o zaman işlemciye biner.
- **Arka Planda Topla** (Kart Düşür → Otomasyon). Pencere gizliyken açık sekmenin listesi
  bellekten düşer, geri döndüğünde yeniden çizilir.

Bakmadığın sekmelerin listeleri zaten kendiliğinden bellekten düşüyor ve pencere gizliyken
çizim tamamen duruyor.

### Nasıl güncellerim?

SteamEdge açılışta yayın listesine bir kez bakar ve yalnızca yeni sürüm varsa pencere
gösterir; sürümün güncelse sessiz kalır. Üst çubuktaki indirme düğmesi aynı denetimi
istediğin an tekrarlar.

Uygulama kendini asla güncellemez. Yeni arşivi yayın sayfasından indir, **boş ve yeni bir
klasöre** çıkar, sonra eski `settings/` klasörünü yeni `SteamEdge.exe` dosyasının yanına
kopyala. Ayarların, kayıtlı hesapların ve oturumun seninle gelir.

Yeni sürümü eski klasörün **üzerine** çıkarmak yapılmaması gereken tek şey: kullanımdaki
dosyalar atlanır, elinde iki sürümün karışımı kalır ve uygulama açılmayı reddeder.

### Dosyalarım nerede?

`SteamEdge.exe` dosyasının yanında, `settings/` ve `cache/` klasörlerinde. Ayarlar →
Gelişmiş → **Veri Klasörünü Aç** seni oraya götürür.

Uygulamayı `C:\Program Files` içine çıkardıysan Windows oraya yazmayı engeller ve uygulama
AppData klasörüne düşer. Taşınabilir düzeni geri kazanmak için klasörü yazılabilir bir yere
taşı.

---

## Özellikler

### Aynı anda birden fazla hesap çalıştırabilir miyim?

Evet. Avatar menüsü → **Hesap Ekle**. Giriş yapılmış tüm hesaplar arka planda paralel kart
toplar; pencere hangisine geçtiysen onu gösterir.

### Saat yükseltme gerçekten çalışıyor mu?

Evet - Steam aynı anda açık olan her oyuna süre işler; bilinen üst sınır 32'dir. Sınır
Steam sunucularında uygulanır, bu uygulamada değil.

### Saat eşitleme nedir?

Birden çok oyunun toplam süresini kademe kademe aynı sayıya getirir. Bkz.
[Kullanım](./TUTORIAL.md#saat-eşitleme).

### Bir başarımı geri kilitleyebilir miyim?

Evet. Ancak özgün açılma tarihi kalıcı olarak kaybolur.

### Steam mobil uygulaması olmadan çalışır mı?

Evet, ama Steam Guard kodlarını elle girmen gerekir ve toplu pazar ilanlarının her biri
hesabının kurulumuna göre ayrı ayrı onay isteyebilir.

### Linux / macOS?

Şu an yalnızca Windows derleniyor. Kod, Windows'a özgü bağımlılığı olmayan düz bir Electron
uygulaması; `npm run build -- --platform=linux` büyük ihtimalle çalışan bir sürüm üretir
ama test edilmemiştir ve desteklenmez.

---

## Proje

### Bu Idle Master / ASF çatalı mı?

Hayır. Sıfırdan yazıldı. O projeler Steam'in nasıl çalıştığını anlamak için incelendi -
hiçbir kod kopyalanmadı. Tam teşekkür listesi: [README](./README.md#teşekkürler).

### Neden AGPL-3.0?

Yeniden dağıtan ya da değiştirilmiş bir sürümü hizmet olarak çalıştıran herkesin kaynağı
açık tutmak zorunda kalması için. Kapalı bir üründe kullanmak istiyorsan ticari lisans için
yazarla iletişime geç.

### Hatayı nasıl bildiririm?

Bir issue aç ve şunları yaz:

1. Ne yaptın, ne bekledin, ne oldu.
2. SteamEdge sürümün (Ayarlar → Hakkında).
3. Windows sürümün.
4. Kayıt: Ayarlar → Gelişmiş → **Hata ayıklama kayıtlarını tut**'u aç, sorunu tekrarla,
   sonra `cache/steamedge.log` dosyasını ekle.

**`settings/session.json` veya `settings/accounts.json` dosyalarını asla ekleme.** Bunlarda
giriş anahtarın var.

Güvenlik açıkları için genel bir issue açmak yerine [SECURITY.md](../../SECURITY.md)
yolunu izle.

### Nasıl yardım edebilirim?

Çeviri, hata bildirimi ve pull request'lerin hepsi açık - bkz.
[CONTRIBUTING.md](../../CONTRIBUTING.md). Arayüz sözlüğü `src/main/js/i18n.js` içinde; bir
dil eklemek tek bir sütun eklemek demek.
