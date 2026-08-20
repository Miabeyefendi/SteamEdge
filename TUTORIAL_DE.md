<div align="center">

# 📖 SteamEdge Anleitung

[English](./TUTORIAL.md) · [Türkçe](./TUTORIAL_TR.md) · **Deutsch** · [Español](./TUTORIAL_ES.md) · [简体中文](./TUTORIAL_ZH.md) · [Русский](./TUTORIAL_RU.md)

[Zurück zur README](./README.md) · [Änderungen](./CHANGELOG.md)

</div>

---

## 📑 Inhalt

- [Überblick](#-überblick)
- [Installation](#-installation)
- [Rundgang durch die Oberfläche](#️-rundgang-durch-die-oberfläche)
- [Funktionsreferenz](#-funktionsreferenz)
- [Einstellungsreferenz](#️-einstellungsreferenz)
- [Fehlerbehebung](#-fehlerbehebung)
- [Häufige Fragen](#-häufige-fragen)
- [Glossar](#-glossar)

---

## 🔭 Überblick

### Was es tut

SteamEdge hält deine Steam-Spiele am Laufen, ohne sie zu starten. Es sammelt Sammelkarten, häuft Spielzeit an, liest und schreibt Erfolge und bepreist dein Inventar am echten Markt. Alles davon verlangt normalerweise einen geöffneten Steam-Client; hier nichts davon.

### Wie es funktioniert

Die Anwendung spricht Steams eigenes Netzwerkprotokoll, dasselbe, das auch der Client benutzt. Sie meldet sich mit einem Sitzungstoken an, teilt Steam mit, welche Spiele gerade gespielt werden, und liest Abzeichenseiten, Inventare, Marktdaten und Erfolgsschemata zurück.

Daraus folgen zwei Dinge, und sie erklären das meiste am Verhalten der Anwendung:

- **Steam ist die einzige Quelle der Wahrheit.** Nichts wird geschätzt oder erfunden. Lässt sich eine Zahl nicht abrufen, zeigt das Feld einen Strich statt einer Vermutung.
- **Steams Grenzen sind die Grenzen der Anwendung.** Marktanfragen sind pro Konto auf etwa 20 pro 30 Sekunden begrenzt, und jeder Teil der Anwendung, der den Markt berührt, teilt sich dieses eine Budget. Karten fallen erst, wenn ein Spiel zwei Stunden Gesamtspielzeit überschreitet. Das sind gemessene Tatsachen, keine Einstellungen.

### Dateiaufbau

Alles liegt neben der ausführbaren Datei. Nichts wird in die Registrierung, nach `AppData` oder nach `Program Files` geschrieben.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              allgemeine Einstellungen
    accounts.json              gespeicherte Konten
    session.json               aktives Sitzungstoken
    accounts/<steamID>.json    pro Konto: Warteschlangen, Voreinstellungen, Statistik
  cache/
    prices.json                Marktpreise, 24 Stunden gültig
    history.json               erzielte Verkaufsdurchschnitte, 72 Stunden gültig
    basarimsiz.json            Spiele ohne Erfolge
    steamedge.log              das Protokoll für einen Fehlerbericht
```

> **Empfindlich ist `settings/`.** In `session.json` liegt ein Token, das ausreicht, um dein Konto zu benutzen. Es gehört nicht in ein geteiltes Backup, ein hochgeladenes Archiv oder einen Screenshot.

---

## 📦 Installation

### Voraussetzungen

Windows 10 oder neuer, 64 Bit. Ein Steam-Konto mit aktiviertem Steam Guard. Etwa 320 MB Speicherplatz nach dem Entpacken. Der Steam-Client wird nicht gebraucht und nie gestartet.

### Schritt für Schritt

1. Lade das neueste `.rar` von der [Veröffentlichungsseite](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Entpacke es in einen Ordner, der dir gehört. Nicht `Program Files`, denn die Anwendung schreibt ihre Einstellungen neben sich selbst.
3. Starte `SteamEdge.exe`.
4. Melde dich an. Der QR-Weg ist der einfachere: Code mit der Steam-App scannen und bestätigen. Der Passwort-Reiter will Benutzernamen, Passwort und einen Steam-Guard-Code.

### Installation prüfen

Unten links steht `SYSTEM: LÄUFT`, sobald eine Sitzung steht, und oben rechts füllt sich die Kontoplakette mit Name, Avatar und Level. Bleibt sie leer, ist die Sitzung nicht zustande gekommen; siehe [Fehlerbehebung](#-fehlerbehebung).

### Aktualisieren

Die Anwendung prüft die veröffentlichte Versionsnummer und sagt Bescheid, wenn eine neuere existiert. Sie lädt und installiert bewusst nichts. Zum Aktualisieren entpackst du das neue Archiv über den alten Ordner und behältst `settings/` und `cache/`.

### Deinstallieren

Ordner löschen. Das ist der ganze Vorgang.

---

## 🖥️ Rundgang durch die Oberfläche

### Übersicht

Die Startseite. Die Kachel **Aktive Aufgabe** zeigt, was tatsächlich läuft, eine Aufgabe nach der anderen, mit Pfeilen zum Blättern, wenn mehrere gleichzeitig laufen. Start, Stopp und Details wirken auf die Aufgabe, die du gerade siehst, nicht auf eine feste Seite.

Darunter die Warteschlange und der Aktivitätsverlauf. Rechts Kacheln für Karten, Bibliotheksgröße, Inventarwert, Stundenbooster und Erfolge. Eine Kachel zeigt einen Strich, solange ihre Seite nicht geladen wurde; das ist eine Aussage darüber, was abgerufen wurde, nicht über dein Konto.

### Kartenfarming

Die Liste der Spiele mit noch ausstehenden Karten, aus deinen Abzeichenseiten gelesen. Modus wählen, Sitzungsdauer setzen, Start drücken.

### Inventar & Markt

Dein Steam-Inventar, zusammengefasst, sodass Dubletten eine Zeile ergeben. Preise und erzielte Verkaufsdurchschnitte werden im Hintergrund abgerufen, ein Gegenstand nach dem anderen, beide Werte zusammen. Die Detailansicht zeigt das Orderbuch und lässt dich einen Gegenstand einstellen.

### Stundenbooster

Deine ganze Bibliothek, durchsuchbar. Spiele auswählen, gleichzeitiges Limit und Dauer setzen, Start drücken. Der optionale Stundenabgleich zieht eine Auswahl auf eine gemeinsame Gesamtzeit.

### Realistischer Modus

Ein dreispaltiger Arbeitsbereich. Links Warteschlange und Sitzungsdauer, in der Mitte die Freischaltreihenfolge, rechts die Einstellungen, aufgeteilt in ein einfaches und ein erweitertes Feld.

### Erfolge

Pro Spiel der echte gesperrte und freigeschaltete Zustand, aus dem Protokoll gelesen. Erfolge auswählen und im Block freischalten oder wieder sperren, mit laufendem Fortschritt und einem Stopp, der auch mitten in einer Wartezeit greift.

### Einstellungen

Alles, was man der Anwendung sagen kann, gruppiert: allgemein, Kartenfarming, Markt, Stundenbooster, realistischer Modus, Privatsphäre, Kontoidentität, Sicherung.

---

## 🧩 Funktionsreferenz

### Kartenfarming

Steam lässt keine Karten fallen, bevor ein Spiel **zwei Stunden** Gesamtspielzeit überschritten hat. Alle Modi bis auf einen ignorieren das und lassen die Spiele einfach laufen; der **schnelle Modus** weiß es und rotiert nur Spiele, die die Schwelle bereits überschritten haben, damit keine Zeit an Spielen verloren geht, die noch gar nichts fallen lassen können.

Die Modi:

| Modus | Was er tut |
|---|---|
| Nacheinander | Ein Spiel nach dem anderen, in Listenreihenfolge |
| Meiste Karten | Spiele mit den meisten verbleibenden Karten zuerst |
| Wenigste Karten | Spiele, die am nächsten am Abschluss sind, zuerst |
| Priorität | Deine eigene Reihenfolge |
| Schnell | Nur Spiele über zwei Stunden, in kurzen Abständen rotiert |

Karten kommen nicht nach Plan, und Steam sendet kein Ereignis "eine Karte ist gefallen". Die Anwendung misst regelmäßig die Summe der verbleibenden Karten und meldet die ehrliche Differenz statt eines erfundenen Zählers.

### Stundenbooster

Lässt bis zu 32 Spiele gleichzeitig laufen. Steam rechnet die Zeit jedem offenen Spiel einzeln an, 32 Spiele eine Stunde offen sind also 32 Stunden Spielzeit.

**Stundenabgleich** zieht eine Auswahl auf dieselbe Gesamtzeit. Zwei Verfahren:

- **Alle zugleich** - jedes ausgewählte Spiel läuft gleichzeitig und fällt heraus, sobald es das Ziel erreicht. Der schnellstmögliche Weg: der ganze Auftrag dauert so lange wie das am weitesten zurückliegende Spiel.
- **Nacheinander** - das am weitesten zurückliegende Spiel wird allein vorgezogen, und sobald es das nächste eingeholt hat, laufen beide zusammen weiter. Langsamer, aber die Spiele bleiben unterwegs auf gleicher Höhe.

Die Fortschrittsbalken liegen auf einer gemeinsamen Zeitachse: ein Balken ist eins minus der Restzeit des Spiels geteilt durch die Länge des gesamten Auftrags. Ein Spiel, das vier Stunden in einen 35-Stunden-Lauf hinein fertig ist, startet fast voll; eines, das bis zum Ende läuft, startet leer. Jeder erreicht genau dann 100%, wenn sein Spiel das Ziel erreicht.

### Erfolge

Erfolge werden über das Protokoll gelesen und geschrieben, nicht durch Auslesen deines öffentlichen Profils. Ein privates Profil macht keinen Unterschied.

Zwei Kategorien lassen sich nicht anfassen, und die Anwendung erkennt beide am Schema, statt wiederholt zu scheitern:

- **Geschützte Erfolge** schreibt der Spielserver. Steam weist jeden Client ab, der es versucht.
- **Spiele ohne Statistik über dieses Protokoll** (einige große Mehrspielertitel) melden `0 / N`. Das ist richtig, kein Fehler.

Manche Spiele nehmen Erfolgsschreibvorgänge nur an, während das Spiel offen ist. Die Anwendung öffnet das Spiel für den Schreibvorgang und stellt danach wieder her, was vorher lief.

### Realistischer Modus

Hält ein Spiel offen und schaltet seine Erfolge über die Sitzung verteilt frei, vom häufigsten zum seltensten. Es geht um die Spur, die das hinterlässt: Hunderte Erfolge innerhalb einer Minute fallen im Profil und auf Drittanbieterseiten sofort auf.

**100%-Abschlusszeit** ist die Zahl, auf der die ganze Seite aufbaut: wie viele Stunden es dauert, dieses Spiel mit allen Erfolgen abzuschließen. Trägst du sie ein, wird sie für dieses Spiel gemerkt. Lässt du sie leer, wird sie aus dem Spieltyp geschätzt, aber diese Schätzung ist deine eigene Spielzeit mal einem Faktor und fällt daher bei viel gespielten Spielen zu hoch aus.

**Zielanzahl** ergibt sich aus zwei Teilen: was bei deiner Spielzeit bereits freigeschaltet sein sollte, minus dem, was es tatsächlich ist, plus dem Anteil dieser Sitzung. Das Feld schreibt die Rechnung aus, damit du sie prüfen kannst.

**Verteilungsmodell** formt die Abstände. Linear ist gleichmäßig, exponentiell lädt vorne auf, wie die ersten Stunden eines echten Spielers aussehen, Pareto legt die meisten in das erste Fünftel.

**Das Tempo** ist nach Seltenheit gewichtet. Nur Erfolge unter 5% warten merklich länger, alles darüber behält einen gleichmäßigen, zügigen Rhythmus. Ein Spiel, das über seine Abschlusszeit hinaus gespielt wurde, staucht den ganzen Plan, denn es gibt keine Lernkurve mehr nachzuahmen.

**Spiele ohne Erfolge** fallen aus der Warteschlange, sobald das feststeht, werden nach `cache/basarimsiz.json` geschrieben und auf dieser Seite nie wieder angeboten. Das Bibliotheks-Flag, das Steam veröffentlicht, ist nicht verlässlich; nur die Schema-Anfrage ist es.

### Inventar und Markt

Der Gegenstandswert ist der **mengengewichtete Median der erzielten Verkäufe**, nicht das niedrigste aktive Angebot. Eine einzelne Person, die eine Karte für 999.999 einstellt, verschiebt ihn nicht.

Preise kommen in der **Währung deines Guthabens** an und werden genau so angezeigt. Es wird bewusst nicht umgerechnet: Umrechnen hieße, einen Wechselkurs zu erfinden.

Preis und Verkaufsdurchschnitt werden **pro Gegenstand gemeinsam** geholt, dann geht die Warteschlange zum nächsten. Beide teilen sich Steams einziges Marktbudget, und das Limit wird in Anfragen gezählt, nicht in Gegenständen.

### Mehrere Konten

Mehrere Konten können gleichzeitig verbunden sein. Jedes hat seine eigene Verbindung, seine eigenen Warteschlangen und seine eigene Datendatei. Ein Kontowechsel startet die Anwendung nicht neu und unterbricht nicht, was die anderen Konten tun.

---

## ⚙️ Einstellungsreferenz

Die Einstellungen liegen in `settings/settings.json`. Alles Folgende ist über die Einstellungsseite bearbeitbar.

### Allgemein

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `uiLang` | `tr` | Sprache der Oberfläche: `tr`, `en`, `de`, `es`, `zh` |
| `autoLaunch` | `false` | Mit Windows starten |
| `preventSleep` | `true` | Rechner wach halten, solange etwas läuft |
| `sessionTimeout` | `never` | Nach so vielen untätigen Minuten trennen. Hintergrundaufgaben setzen den Zähler nicht zurück, nur deine Eingaben |

### Kartenfarming

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `autoNextGame` | `true` | Zum nächsten Spiel wechseln, wenn eines fertig ist |
| `cardMaxGames` | `32` | Gleichzeitig offene Spiele |
| `fastMinPlaytimeMin` | `120` | Der schnelle Modus überspringt Spiele darunter |
| `pauseFarmOnBoost` | `false` | Farming stoppen, wenn der Stundenbooster startet |

### Markt

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `priceRefreshHours` | `24` | Wie lange ein abgerufener Preis frisch bleibt |
| `historyRefreshHours` | `72` | Wie lange ein Verkaufsdurchschnitt frisch bleibt |
| `fetchAvgWithPrice` | `true` | Durchschnitt im selben Durchgang wie den Preis holen. Aus bedeutet eine Anfrage pro Gegenstand und Durchschnitte nur über die Schaltfläche |
| `bookDepth` | `5` | Orderbuch-Zeilen in der Detailansicht |

### Stundenbooster

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `boostMaxGames` | `32` | Gleichzeitig offene Spiele |
| `boostDurationSec` | `3600` | Sitzungsdauer |
| `boostSync` | `false` | Auswahl auf eine gemeinsame Gesamtzeit ziehen |
| `boostSyncMode` | `highest` | Ziel: höchstes ausgewähltes, manuelle Stunden oder höchstes der Bibliothek |
| `boostSyncStrategy` | `parallel` | `parallel` heißt alle zugleich, `staged` nacheinander |
| `boostAutoRestart` | `false` | Warteschlange nach Sitzungsende erneut starten |
| `rememberBoostList` | `false` | Auswahl zwischen Sitzungen behalten |

### Realistischer Modus

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `grDurationSec` | `7200` | Sitzungsdauer |
| `grModel` | `linear` | Verteilungsmodell |
| `grTcOyun` | `{}` | 100%-Abschlusszeit pro Spiel, in Stunden |
| `grCatchUp` | `true` | Den Rückstand in den Anfang der Sitzung stauchen |
| `grHiz` | `1` | Geschwindigkeitsfaktor für den ganzen Plan |
| `grUltraCarpan` | `3` | Wie viel länger Erfolge unter 5% warten |
| `grTelafiPay` | `20` | Anteil der Sitzung für das Aufholen, in Prozent |
| `grBitmisSik` | `50` | Wie stark der Plan bei einem abgeschlossenen Spiel staucht |
| `grKeepHours` | `true` | Nach den Freischaltungen weiter Stunden sammeln |
| `grSkipUltraRare` | `false` | Erfolge unter 5% ganz überspringen |

### Privatsphäre

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `offlineMode` | `false` | Während des Laufs offline erscheinen |
| `hideGameName` | `false` | Zeigen, dass du online bist, aber nicht welches Spiel |

> Offline zu erscheinen ändert, was Freunde sehen. Es kann auch ändern, ob Steam dich als spielend zählt; teste es, bevor du dich in einer langen Sitzung darauf verlässt.

### Wo die Einstellungen liegen

Allgemeines in `settings/settings.json`. Alles, was zu einem Konto gehört, also die Auswahl des Stundenboosters, Warteschlange und Voreinstellungen des realistischen Modus, das Erfolgsprotokoll und die Statistik, liegt in `settings/accounts/<steamID>.json`. Zwischenspeicher sind davon getrennt unter `cache/` und können jederzeit gelöscht werden, ohne dass Einstellungen verloren gehen.

---

## 🔧 Fehlerbehebung

### Die Anwendung öffnet sich und schließt sofort wieder

Es läuft bereits eine Kopie. SteamEdge erlaubt nur eine Instanz. Sieh im Task-Manager nach `SteamEdge.exe` und schließe sie zuerst.

### Die Kontoplakette bleibt leer und nichts lädt

Die Steam-Sitzung ist nicht zustande gekommen. Unter der oberen Leiste erscheint ein Band, wenn die Verbindung abbricht oder wiederholt wird. Hält das an, prüfe zuerst, ob Steam selbst erreichbar ist, und sieh dann in `cache/steamedge.log` nach dem Grund.

### "40 Karten übrig", aber nur eine Handvoll ist gefallen

Karten fallen erst, wenn ein Spiel zwei Stunden Gesamtspielzeit überschreitet, und jedes Spiel hat nur eine begrenzte Anzahl. Eine lange Sitzung mit Spielen, die alle unter zwei Stunden liegen, bringt gar nichts; nimm den schnellen Modus, der nur Spiele über der Schwelle wählt.

### Preise zeigen einen Strich oder füllen sich sehr langsam

Steam erlaubt pro Konto etwa 20 Marktanfragen je 30 Sekunden, geteilt zwischen Preisen, Verkaufsdurchschnitten und Angeboten. Ein großes Inventar dauert deshalb. Mit `fetchAvgWithPrice` kostet jeder Gegenstand zwei Anfragen, ein volles Inventar dauert also doppelt so lange, dafür wartest du keinen zweiten Durchgang auf die Durchschnitte.

### Ein Erfolg lässt sich nicht freischalten

Entweder ist er geschützt, das heißt der Spielserver schreibt ihn und kein Client darf das, oder das Spiel führt über dieses Protokoll keine Statistik. Beides wird erkannt und gemeldet statt wiederholt versucht. Der Blockvorgang bricht nach drei Fehlschlägen in Folge ab und nennt den Grund, statt hängengeblieben auszusehen.

### Der realistische Modus schlägt nur ein oder zwei Freischaltungen vor

Die Abschlusszeit ist zu hoch. Leer gelassen wird sie aus deiner Spielzeit geschätzt, ein lange gespieltes Spiel liest sich also als enorm langes Spiel. Trag die echte 100%-Abschlusszeit in das Feld im Hauptbereich ein.

### Ein Protokoll für einen Fehlerbericht sammeln

Das Protokoll ist `cache/steamedge.log` neben der ausführbaren Datei, oder aus den Einstellungen zu öffnen. Es hält Verbindungsereignisse, Warteschlangenentscheidungen und Fehler fest. Es enthält **weder** dein Passwort **noch** dein Sitzungstoken, ist also sicher anzuhängen; sieh es trotzdem durch, bevor du es veröffentlichst.

---

## ❓ Häufige Fragen

<details>
<summary><b>Braucht es den Steam-Client?</b></summary>

Nein, und er wird nie gestartet.

</details>

<details>
<summary><b>Kann ich mehrere Konten gleichzeitig betreiben?</b></summary>

Ja. Jedes behält seine eigene Verbindung und seine eigenen Daten, und Konten im Hintergrund arbeiten weiter, während du dir ein anderes ansiehst.

</details>

<details>
<summary><b>Gibt es eine automatische Aktualisierung?</b></summary>

Bewusst nicht. Die Anwendung liest die veröffentlichte Versionsnummer und sagt Bescheid, wenn eine neuere existiert. Sie lädt nichts herunter und verändert nichts.

</details>

<details>
<summary><b>Warum ist alles in meiner Guthabenwährung?</b></summary>

Weil Steam es so schickt. Umrechnen hieße, einen Kurs zu erfinden.

</details>

<details>
<summary><b>Kann ich meine Installation auf einen anderen Rechner mitnehmen?</b></summary>

Kopiere den Ordner, alles steckt darin. Denk daran, dass in `settings/` dein Sitzungstoken liegt, kopiere also privat.

</details>

---

## 📕 Glossar

| Begriff | Bedeutung |
|---|---|
| **AppID** | Steams numerische Kennung für ein Spiel, etwa 1091500 für Cyberpunk 2077 |
| **Abzeichenseite** | Die Steam-Seite, die auflistet, wie viele Kartenausgaben ein Spiel noch hat |
| **Drop** | Eine für Spielzeit vergebene Sammelkarte |
| **market_hash_name** | Der genaue Name, unter dem der Markt einen Gegenstand führt |
| **Orderbuch** | Die aktuelle Tabelle der Kaufaufträge und Verkaufsangebote für einen Gegenstand |
| **Geschützter Erfolg** | Einer, den nur der Spielserver setzen darf, kein Client |
| **Erzielter Verkauf** | Eine abgeschlossene Transaktion, im Gegensatz zu einem aktiven Angebot |
| **Schema** | Steams Definition der Erfolge und Statistiken eines Spiels |
| **Sitzungstoken** | Der Nachweis, der dich angemeldet hält. Behandle ihn wie ein Passwort |
| **Tc** | 100%-Abschlusszeit: Stunden, um ein Spiel mit allen Erfolgen abzuschließen |

---

<div align="center">

[Zurück zur README](./README.md) · [Fehler melden](https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml)

</div>
