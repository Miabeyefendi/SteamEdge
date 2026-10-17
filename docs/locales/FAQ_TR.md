[← README'ye dön](../../README.md)

# ❓ Sık sorulanlar

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

Yeni sürümün boş ve yeni bir klasöre çıkarıldığından, yalnızca `settings/` klasörünün kopyalandığından emin ol; eski klasörün üzerine çıkarmak iki sürümün dosyalarını karıştırır. Önce rehberin [sorun giderme bölümüne](./TUTORIAL_TR.md#-sorun-giderme), sonra `cache/steamedge.log` dosyasına bak. Hâlâ bozuksa bir hata bildirimi aç ve o kaydı ekle.

</details>
