<!--
================================================================================
REHBER ŞABLONU (TÜRKÇE) - Miabeyefendi (https://github.com/Miabeyefendi)

NASIL KULLANILIR
  1. Her <YER_TUTUCU> yerine bu projenin gerçek değerlerini yaz.
  2. Aşağıdaki sekiz ana bölüm sabittir. Geçerli olmayan bölümü silebilirsin
     ama kalanların sırasını ve adını değiştirme.
  3. Bu dosya "nasıl çalışıyor ve her ayar ne yapıyor" sorusunu cevaplar.
     README "bu nedir ve nasıl başlarım" sorusunu cevaplar. Tekrarlama.
  4. İngilizce sürüm asıldır. TUTORIAL_TR / _ES / _ZH aynı commit'te güncellenir.
  5. Her başlık içindekiler listesine girer. Yeniden adlandırdıktan sonra
     bağlantı çapalarını kontrol et.
================================================================================
-->

<div align="center">

# 📖 SteamEdge Rehberi

**<Sürüm> · Son güncelleme <YYYY-AA-GG>**

[English](./TUTORIAL.md) · **Türkçe** · [Español](./TUTORIAL_ES.md) · [繁體中文](./TUTORIAL_ZH.md) · [Русский](./TUTORIAL_RU.md)

[README'ye dön](./README_TR.md) · [Değişiklikler](./CHANGELOG.md)

</div>

---

Bu belge SteamEdge'nun her parçasının ne yaptığını, arka planda nasıl çalıştığını ve
her ayarın gerçekte neyi değiştirdiğini anlatır. Sadece kurup çalıştırmak
istiyorsan [README](./README_TR.md) daha kısa.

## 📑 İçindekiler

- [Genel bakış](#-genel-bakış)
- [Kurulum](#-kurulum)
- [Arayüz turu](#️-arayüz-turu)
- [Özellik referansı](#-özellik-referansı)
- [Yapılandırma referansı](#️-yapılandırma-referansı)
- [Sorun giderme](#-sorun-giderme)
- [Sık sorulanlar](#-sık-sorulanlar)
- [Sözlük](#-sözlük)

---

## 🔭 Genel bakış

### Ne yapar

<İki üç paragraf. Sorun, yaklaşım, sonuç. Projeyi hiç görmemiş biri için yaz.>

### Nasıl çalışır

<Mekanizma, sade bir dille. Ne çalışıyor, ne zaman, hangi sırayla. Bir işlem
hattı varsa her aşamayı anlat.>

```
<Yardımcı olacaksa düz metin şema. Sadece ASCII, görsel değil; böylece iki
temada da çalışır ve asla 404 vermez.>
```

### Dosya düzeni

| Yol | Orada ne var |
|---|---|
| `<yol>` | <tek satır> |
| `<yol>` | <tek satır> |
| `<yol>` | <tek satır> |

---

## 📦 Kurulum

### Gereksinimler

<README'deki liste, her maddenin neden gerektiği eklenerek genişletilmiş hali.>

### Adım adım

1. <Adım, tam komutuyla.>
2. <Adım.>
3. <Adım, ve işe yaradığında ne görmen gerektiği.>

### Kurulumu doğrulama

<Gerçekten çalıştığını nasıl anlarsın. Bir komut, beklenen çıktı, bir ekran.>

### Güncelleme

<Yeni bir sürüme nasıl geçilir, neler taşınır.>

### Kaldırma

<Nasıl tamamen kaldırılır; klasör dışına yazdığı ayarlar dahil.>

---

## 🖥️ Arayüz turu

<!-- Arayüzü olmayan projelerde bu bölümü sil. -->

<div align="center">
  <img src="./screenshots/<ad>.png" width="92%" alt="<ne göründüğü>"/>
  <br/>
  <sub><b><Panel adı></b> · <ne işe yaradığı></sub>
</div>

### <Panel veya sekme adı>

<Ne gösterdiği ve burada ne yapabileceğin. Tek paragraf.>

| Kontrol | Ne yapar |
|---|---|
| `<kontrol>` | <tek satır> |
| `<kontrol>` | <tek satır> |

### <Panel veya sekme adı>

<Her panel ve sekme için tekrarla.>

---

## 🧩 Özellik referansı

<!-- README'nin Öne Çıkanlar bölümündeki her madde için bir alt bölüm, aynı
     sırayla. README'nin taşımayı reddettiği detay buraya gelir. -->

### <Özellik adı>

**Ne yapar.** <Tek paragraf.>

**Nasıl çalışır.** <Mekanizma. Sayılar, eşikler, algoritmalar, zamanlamalar.>

**Nasıl kullanılır.** <Adımlar.>

**Sınırları.** <Neyi yapmaz ve neden.>

---

### <Özellik adı>

**Ne yapar.** <...>

**Nasıl çalışır.** <...>

**Nasıl kullanılır.** <...>

**Sınırları.** <...>

---

## ⚙️ Yapılandırma referansı

Her ayar, neyi kabul ettiği ve değiştirdiğinde ne olduğu.

### <Grup adı>

| Anahtar | Tür | Varsayılan | Etkisi |
|---|---|---|---|
| `<anahtar>` | `<tür>` | `<varsayılan>` | <tek satır> |
| `<anahtar>` | `<tür>` | `<varsayılan>` | <tek satır> |

### <Grup adı>

| Anahtar | Tür | Varsayılan | Etkisi |
|---|---|---|---|
| `<anahtar>` | `<tür>` | `<varsayılan>` | <tek satır> |

### Ayarların tutulduğu yer

<Yol, biçim ve elle düzenlemenin güvenli olup olmadığı. Hesap bilgisi tutan,
yani asla commit edilmemesi ve paylaşılmaması gereken dosyaları açıkça belirt.>

---

## 🔧 Sorun giderme

### <Belirti, bir kullanıcının anlatacağı gibi yazılmış>

**Sebep.** <Neden oluyor.>
**Çözüm.** <Ne yapılmalı.>

### <Belirti>

**Sebep.** <...>
**Çözüm.** <...>

### Hata bildirimi için log toplama

<Log nerede, ayrıntılı mod nasıl açılır ve paylaşmadan önce içinden ne
çıkarılmalı. Token, çerez ve hesap adları asla bir issue'ya girmez.>

---

## ❓ Sık sorulanlar

**<Soru>**
<Cevap.>

**<Soru>**
<Cevap.>

**<Soru>**
<Cevap.>

---

## 📕 Sözlük

| Terim | Anlamı |
|---|---|
| <terim> | <tek satır, bu projenin bağlamında> |
| <terim> | <tek satır> |

---

<div align="center">
<img src="./assets/divider.svg" width="100%" height="3" alt="">
<br/>
<sub><b><a href="https://github.com/Miabeyefendi">Miabeyefendi</a></b> tarafından yapıldı · <a href="./README_TR.md">README'ye dön</a></sub>
</div>
