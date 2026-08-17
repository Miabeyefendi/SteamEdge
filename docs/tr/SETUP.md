# Kurulum

[English](../en/SETUP.md) · [Türkçe](../tr/SETUP.md) · [Deutsch](../de/SETUP.md) · [Español](../es/SETUP.md) · [繁體中文](../zh/SETUP.md)

SteamEdge'i çalıştırmak yaklaşık iki dakika sürer. Kurulum sihirbazı yoktur ve Windows
kayıt defterine hiçbir şey yazılmaz.

---

## 1. İndir

[Sürümler](https://github.com/Miabeyefendi/steamedge/releases/latest) sayfasından
`SteamEdge-vX.Y.Z-win-x64.rar` dosyasını indir.

## 2. Çıkar

Zip dosyasına sağ tıkla → **Tümünü ayıkla**. Klasörü yazma iznin olan bir yere koy:

- Uygun: `Masaüstü`, `Belgeler`, `D:\Uygulamalar\SteamEdge`, USB bellek
- Kaçın: `C:\Program Files` (Windows oraya yazmayı engeller, bu yüzden ayarlar exe'nin
  yanında kalmak yerine AppData klasörüne düşer)

Şunu elde edersin:

```
SteamEdge/
  SteamEdge.exe        uygulama
  settings/            ilk açılışta oluşur - ayarların, hesapların, oturumun, istatistiklerin
  cache/               ilk açılışta oluşur - fiyat önbelleği ve kayıt dosyası
  resources/           uygulamanın kendi dosyaları, dokunma
  README.txt           kısa kullanıcı notu
```

## 3. İlk açılış

`SteamEdge.exe` dosyasına çift tıkla.

Windows SmartScreen **"Windows bilgisayarınızı korudu"** uyarısı gösterebilir. Bunun sebebi
çalıştırılabilir dosyanın kod imzası taşımaması; imza sertifikası yılda birkaç yüz dolar
tutuyor ve ücretsiz bir hobi projesinde bu yok. **Ek bilgi → Yine de çalıştır**'a bas.

Tanımadığın birinden gelen bir ikili dosyaya güvenmek istemiyorsan bu tamamen makul bir
tutum: onun yerine [kaynaktan kendin derle](#kendin-derlemek).

## 4. Giriş yap

İki seçeneğin var.

### Seçenek A - QR kod (önerilen)

1. Telefonunda **Steam mobil uygulamasını** aç.
2. Menü → **Steam Guard** → QR tarayıcı simgesi.
3. SteamEdge'de görünen kodu okut.
4. Girişi telefonundan onayla.

Şifreni hiçbir yere yazmazsın. En güvenli seçenek budur.

### Seçenek B - Kullanıcı adı ve şifre

1. Steam kullanıcı adını ve şifreni yaz.
2. İstendiğinde Steam Guard kodunu gir (mobil uygulamadan veya e-postandan).

Şifren yalnızca bir kez anahtar almak için kullanılır ve **kaydedilmez**. Kaydedilen şey,
Steam'in verdiği yenileme anahtarıdır ve `settings/session.json` içinde tutulur.

> **`settings/` klasörünü koru.** Onu kopyalayan herkes senin adına giriş yapabilir.
> Yükleme, paylaşılan klasöre koyma, hata bildirimine ekleme.

## 5. İsteğe bağlı - mobil doğrulayıcı dosyası (maFile)

Giriş yaptıktan sonra SteamEdge bir maFile üretebilir. Bu, Steam Guard kodlarını otomatik
girmesini sağlar; toplu pazar satışlarının her birini telefondan onaylamak istemiyorsan
işine yarar.

Atlayabilirsin. **Atla (maFile'sız devam)** dediğinde otomatik onay dışındaki her şey
çalışmaya devam eder.

Başka bir araçtan maFile'ın varsa **maFile içe aktar** seçeneğini kullan.

## 6. Ek hesap ekleme

SteamEdge aynı anda birden fazla hesapta kart toplar.

1. Sağ üstteki avatarına tıkla → **Hesap Ekle**.
2. İkinci hesapla giriş yap (QR ya da şifre).
3. Artık iki hesap da arka planda paralel çalışır.

Pencerenin hangi hesabı göstereceğini aynı avatar menüsünden seçersin. Sen birine bakarken
diğerleri çalışmaya devam eder.

## Verilerin nerede

| Yol | İçeriği | Silinebilir mi? |
|---|---|---|
| `settings/settings.json` | Tüm tercihlerin | Evet - varsayılana döner |
| `settings/session.json` | Giriş anahtarın | Evet - oturumun kapanır |
| `settings/accounts.json` | Kayıtlı hesap listesi | Evet - yeniden giriş gerekir |
| `settings/stats.json` | Kalıcı toplamlar | Evet - yalnızca geçmiş kaybolur |
| `settings/state.json` | Kuyruk sırası, başarım günlüğü | Evet |
| `cache/prices.json` | Pazar fiyat önbelleği | Evet - fiyatlar yeniden çekilir |
| `cache/steamedge.log` | Tanılama kaydı | Evet |
| `cache/chromium/` | Arayüz önbelleği | Evet |

**Yedekleme:** Ayarlar → Genel → Yedekleme → **Dışa Aktar**. Tercihlerini ve
istatistiklerini tek bir `.json` dosyasına yazar. Giriş anahtarları ve kayıtlı hesaplar
bilerek **dahil edilmez**, bu yüzden yedek dosyasını bulut depolamada tutmak güvenlidir.

## Başka bilgisayara taşıma

Klasörün tamamını kopyala. Ayarların, hesapların ve oturumun seninle gelir. Steam yeni
cihazı telefonundan onaylamanı isteyebilir.

## Kaldırma

Klasörü sil. Hepsi bu - kayıt defteri anahtarı yok, başka yerde artık dosya yok.

## Kendin derlemek

İndirilmiş bir ikili dosyayı çalıştırmak istemiyorsan:

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start
```

[Node.js](https://nodejs.org/) 20 veya üstü gerekir. Kendi taşınabilir sürümünü üretmek için:

```bash
npm run build
```

Sonuç, kaynak klasörünün yanındaki `../SteamEdge-vX.Y.Z-win-x64` klasöründe oluşur.

---

Sıradaki: [Kullanım](./TUTORIAL.md) - ilk kartlarını topla.
