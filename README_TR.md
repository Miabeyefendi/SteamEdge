<div align="center">

<img src="./assets/logo-mark.png" width="120" alt="SteamEdge">

# SteamEdge

**Steam istemcisini hiç açmadan ticari kart topla, oynanma süresi biriktir, başarımlarını yönet.**

[![Lisans: AGPL v3](https://img.shields.io/badge/Lisans-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](./LICENSE)
[![Sürüm](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=s%C3%BCr%C3%BCm)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![Platform](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-kurulum)
[![Durum](https://img.shields.io/badge/durum-etkin-22C55E?style=for-the-badge)](#)
[![Yazar](https://img.shields.io/badge/yazan-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](./README.md) · **Türkçe** · [Español](./README_ES.md) · [简体中文](./README_ZH.md) · [Русский](./README_RU.md)

[Kurulum](#-kurulum) · [Özellikler](#-öne-çıkanlar) · [Kullanım](#-hızlı-başlangıç) · [Rehber](./TUTORIAL_TR.md) · [Sürüm notları](./CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="./assets/btn-download.svg" height="52" alt="En son sürümü indir">
</a>
<a href="./TUTORIAL_TR.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-tutorial-dark.svg">
    <img src="./assets/btn-tutorial.svg" height="52" alt="Rehberi oku">
  </picture>
</a>

<img src="./screenshots/main-showcase.jpg" width="92%" alt="SteamEdge, Steam istemcisi olmadan kart topluyor, saat yükseltiyor ve başarım yönetiyor">

</div>

---

## ✨ Öne çıkanlar

- **Kart düşürme** - Oyunlarını "oynanıyor" gösterir, ticari kartlar düşer. Beş mod var; biri Steam'in kart düşürmeye ancak oyun iki saati geçince başladığını bilir.
- **Saat yükseltici** - Aynı anda 32 oyuna kadar açık tutar. İsteğe bağlı saat eşitlemesi seçili oyunları aynı toplam süreye çeker.
- **Başarım yöneticisi** - Kilitli ve açık durumu doğrudan Steam protokolünden okur, toplu açar ya da yeniden kilitler.
- **Gerçekçi Mod** - Tek oyunu açık tutar ve başarımlarını en yaygından en nadire doğru, süreye yayarak açar. Profilde gerçekten oynanmış gibi bir iz bırakır.
- **Envanter ve pazar** - Gerçek satış geçmişi, sipariş defteri, toplu ortalama fiyat ve satış. Hepsi hesabın cüzdan kurunda.
- **Çoklu hesap** - Birden çok hesap aynı anda bağlı, her biri arka planda çalışır, ilerleme kaybolmadan geçiş yapılır.
- **Steam istemcisi gerekmez** - Steam'in kendi ağ protokolüyle konuşur. İstemci hiç açılmaz, gerekmez de.
- **Taşınabilir** - Çıkar ve çalıştır. Kurulum yok, kayıt defterine dokunulmaz, her şey exe'nin yanında durur.

---

## 📦 Kurulum

### Gereksinimler

| | |
|---|---|
| İşletim sistemi | Windows 10 ya da üstü, 64 bit |
| Steam hesabı | Steam Guard kurulu, mobil ya da e-posta |
| Disk alanı | Çıkarılmış hâlde yaklaşık 320 MB |
| Steam istemcisi | Gerekmez, kullanılmaz |

### Kullanılan araçlar

![Electron](https://img.shields.io/badge/Electron-1E293B?style=for-the-badge&logo=electron&logoColor=A78BFA)
![Node.js](https://img.shields.io/badge/Node.js-1E293B?style=for-the-badge&logo=nodedotjs&logoColor=A78BFA)
![JavaScript](https://img.shields.io/badge/JavaScript-1E293B?style=for-the-badge&logo=javascript&logoColor=A78BFA)

### Kaynaktan kurulum

```bash
git clone https://github.com/Miabeyefendi/SteamEdge.git
cd SteamEdge
npm install
```

<details>
<summary><b>Yayınlanmış sürümden kurmak</b></summary>

1. [Yayınlar sayfasından](https://github.com/Miabeyefendi/SteamEdge/releases/latest) en son `.rar` dosyasını indir.
2. İstediğin yere çıkar. Kendi sahip olduğun bir klasöre, `Program Files` içine değil.
3. `SteamEdge.exe` dosyasını çalıştır. Kurulacak bir şey yok; o klasörün dışına hiçbir şey yazılmaz.

</details>

---

## 🚀 Hızlı başlangıç

```bash
npm start
```

İlk açılışta giriş ekranı gelir. QR kodunu Steam mobil uygulamasıyla okut ya da parola sekmesine geçip kullanıcı adı, parola ve Steam Guard kodunu gir. Hiçbir şey saklanmaz; yalnızca bir oturum anahtarı exe'nin yanındaki `settings/` klasörüne yazılır.

Girdikten sonra Genel Bakış neyin çalıştığını ve neyin hazır olduğunu gösterir. **Kart Düşür** sekmesini aç, listeyi yenile, bir mod seç ve Başlat'a bas. Gerisi [rehberi](./TUTORIAL_TR.md) okuyana kadar bekleyebilir.

---

## ⚙️ Yapılandırma

Ayarlar exe'nin yanındaki `settings/settings.json` dosyasında, hesaba özel veriler ise `settings/accounts/<steamID>.json` içinde durur. Hepsi uygulamadaki Ayarlar sayfasından düzenlenebilir; dosyalara elle dokunmak için bir sebep yok.

> **`settings/` klasörünü kimseyle paylaşma.** İçinde Steam oturum anahtarın var ve o anahtar hesabını kullanmaya yeter.

| Anahtar | Varsayılan | Ne yapar |
|---|---|---|
| `boostMaxGames` | `32` | Saat yükseltici aynı anda kaç oyunu açık tutar |
| `boostSync` | `false` | Seçili oyunları aynı toplam süreye çeker |
| `fetchAvgWithPrice` | `true` | Bir eşyanın ortalamasını fiyatıyla aynı turda çeker |
| `pauseFarmOnBoost` | `false` | Saat yükseltici başlayınca kart düşürmeyi durdurur |
| `sessionTimeout` | `never` | Bu kadar dakika işlem yapılmazsa bağlantıyı keser |
| `uiLang` | `tr` | Arayüz dili: `tr`, `en`, `de`, `es`, `zh` |

Anahtarların tamamı [yapılandırma başvurusunda](./TUTORIAL_TR.md#️-yapılandırma-başvurusu) yazılı.

---

## 📖 Belgeler

- [**Rehber**](./TUTORIAL_TR.md) - her özellik, her ayar, tam anlatımıyla
- [**Sürüm notları**](./CHANGELOG.md) - hangi sürümde ne değişti
- [**Katkı**](./CONTRIBUTING.md) - değişiklik nasıl gönderilir
- [**Güvenlik**](./SECURITY.md) - açık nasıl gizlice bildirilir

---

## 🧭 Yol haritası

- [ ] Steam sohbet entegrasyonu. Motor gelen mesajı zaten alıyor ve otomatik yanıt verebiliyor; eksik olan arayüz.
- [ ] Rusça arayüz dili, belgelerle aynı hizaya gelsin.
- [ ] Kalan sayfaların tasarım şablonuna göre yenilenmesi, sürüm başına bir sayfa.
- [x] Gerçekçi Mod şablona göre yeniden yapıldı
- [x] Öğe bazlı pazar kuyruğu, fiyat ve ortalama birlikte çekiliyor

Buradakilerin hiçbiri söz değil. Bu kişisel bir proje ve öncelikler değişince liste de değişir.

---

## ❓ Sık sorulanlar

<details>
<summary><b>Steam istemcisinin açık olması gerekiyor mu?</b></summary>

Hayır. SteamEdge doğrudan Steam'in kendi ağ protokolüyle konuşur. İstemci hiç açılmaz, açık olması da bir şey değiştirmez.

</details>

<details>
<summary><b>Hesabım yasaklanır mı?</b></summary>

Oyunları boşta çalıştırmak ve protokol üzerinden başarım açmak pek çok aracın yaptığı iş ve Valve bu konuda açık bir tutum belirtmiş değil. Bu, güvenli olduğu anlamına gelmez. Riski sen alıyorsun. Karar vermeden önce aşağıdaki sorumluluk reddini oku.

</details>

<details>
<summary><b>Fiyatlar neden benim para birimime çevrilmiyor?</b></summary>

Zaten o para biriminde. Fiyatlar Steam'den hesabının cüzdan kurunda gelir ve geldiği gibi gösterilir. Çevirmek bir kur uydurmak demek olurdu; uydurma sayı, sayı olmamasından kötüdür.

</details>

<details>
<summary><b>Bir başarım açılmıyor, neden?</b></summary>

Bazı başarımları oyun sunucusu yazar, istemci değil; Steam hiçbir istemcinin bunlara dokunmasına izin vermez. SteamEdge bunları şemadan tanır ve tekrar tekrar denemek yerine ayıklar. Birkaç oyun da bu protokol üzerinden hiç istatistik tutmaz; o zaman `0 / N` görürsün ve yapılacak bir şey yoktur.

</details>

<details>
<summary><b>Güncellemeden sonra bozuldu, ne yapmalıyım?</b></summary>

Önce rehberin [sorun giderme bölümüne](./TUTORIAL_TR.md#-sorun-giderme), sonra `cache/steamedge.log` dosyasına bak. Hâlâ bozuksa bir hata bildirimi aç ve o kaydı ekle.

</details>

---

## 🤝 Katkı

Katkılar hoş karşılanır. Önce [CONTRIBUTING.md](./CONTRIBUTING.md) ve
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) dosyalarını oku. Katkı vererek
çalışmanı AGPL-3.0 altında lisanslamayı kabul etmiş olursun.

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-report-bug-dark.svg">
    <img src="./assets/btn-report-bug.svg" height="52" alt="Hata bildir">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-star-dark.svg">
    <img src="./assets/btn-star.svg" height="52" alt="Depoyu yıldızla">
  </picture>
</a>
</div>

---

## 🛡️ Güvenlik

Bir açık mı buldun? Herkese açık bir issue açma. [SECURITY.md](./SECURITY.md)
içindeki gizli bildirim yolunu izle.

---

## 📜 Lisans

Bu proje **GNU Affero General Public License v3.0 (AGPL-3.0)** ile,
[NOTICE](./NOTICE) dosyasındaki ek koşullarla birlikte lisanslanmıştır.
Kısaca:

- Yazılımı ücretsiz kullanabilir, inceleyebilir, değiştirebilir, dağıtabilir ve
  hatta parasını kazanabilirsin; **yeter ki** kaynak kodun tamamını AGPL-3.0
  altında erişilebilir tutasın (barındırılan, SaaS ya da ağ üzerinden kullanım
  dahil, AGPL 13. madde) ve aşağıdaki yazar atfını koruyasın.
- Bu çalışmayı kapalı kaynaklı ya da tescilli bir üründe kullanmak, ya da kapalı
  bir SaaS olarak çalıştırmak için **ayrı bir yazılı ticari lisans** gerekir; bu
  lisans telif ya da gelir payı içerebilir. [NOTICE](./NOTICE) 8. bölüme bak ve
  benimle iletişime geç.

### Atıf (zorunlu)

AGPL-3.0 7(b) maddesi gereği, aşağıdaki atıf bu projenin her kopyasında,
çatalında ve dağıtımında görünür ve değiştirilmemiş hâlde korunmalıdır:

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### Sorumluluk reddi

Bu yazılım hiçbir garanti verilmeksizin "olduğu gibi" sunulur. Tamamen kendi
riskinle çalıştırırsın ve etkileşime girdiği üçüncü taraf platformların kullanım
koşullarına uymak dahil, kullanımından yalnızca sen sorumlusun. Valve ve Steam
yazarla bağlantılı değildir ve bu projeyi onaylamış değildir; adları ve markaları
sahiplerine aittir. Yazar; hesap yasaklanması, veri kaybı ya da başka hiçbir
zarardan, yürürlükteki yasaların izin verdiği azami ölçüde sorumlu tutulamaz.
Koşulların tamamı [LICENSE](./LICENSE) ve [NOTICE](./NOTICE) dosyalarındadır.

---

## 📬 İletişim

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- Ticari lisans ya da gelir paylaşımı için GitHub profilim üzerinden ulaş.
