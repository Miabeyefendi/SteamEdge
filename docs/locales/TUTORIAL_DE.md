<div align="center">

# 📖 SteamEdge Anleitung

[English](../guides/TUTORIAL.md) · [Türkçe](./TUTORIAL_TR.md) · **Deutsch** · [Español](./TUTORIAL_ES.md) · [简体中文](./TUTORIAL_ZH.md) · [Русский](./TUTORIAL_RU.md)

[Zurück zur README](../../README.md) · [Änderungen](../../CHANGELOG.md)

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

SteamEdge hält deine Steam-Spiele am Laufen, ohne sie zu starten. Es sammelt Sammelkarten, häuft Spielzeit an, liest und schreibt Errungenschaften und bepreist dein Inventar am echten Markt. Alles davon verlangt normalerweise einen geöffneten Steam-Client; hier nichts davon.

### Wie es funktioniert

Die Anwendung spricht Steams eigenes Netzwerkprotokoll, dasselbe, das auch der Client benutzt. Sie meldet sich mit einem Sitzungstoken an, teilt Steam mit, welche Spiele gerade gespielt werden, und liest Abzeichenseiten, Inventare, Marktdaten und Errungenschaftsschemata zurück.

Daraus folgen zwei Dinge, und sie erklären das meiste am Verhalten der Anwendung:

- **Steam ist die einzige Quelle der Wahrheit.** Nichts wird geschätzt oder erfunden. Lässt sich eine Zahl nicht abrufen, zeigt das Feld einen Strich statt einer Vermutung.
- **Steams Grenzen sind die Grenzen der Anwendung.** Marktanfragen sind pro Konto auf etwa 20 pro 30 Sekunden begrenzt, und jeder Teil der Anwendung, der den Markt berührt, teilt sich dieses eine Budget. Karten fallen erst, wenn ein Spiel zwei Stunden Gesamtspielzeit überschreitet. Das sind gemessene Tatsachen, keine Einstellungen. Für das Einstellen von Angeboten gilt ein eigenes, kontoabhängiges Limit, das Steam nicht veröffentlicht.

### Dateiaufbau

Alles liegt neben der ausführbaren Datei. Nichts wird in die Registrierung, nach `AppData` oder nach `Program Files` geschrieben.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              allgemeine Einstellungen
    accounts.json              gespeicherte Konten
    session.json               aktives Sitzungstoken
    stats.json                 Gesamtstatistik
    state.json                 gemerkte Warteschlangen und Errungenschaftsprotokoll
    accounts/<steamID>.json    pro Konto: Warteschlangen, Voreinstellungen, Statistik
  cache/
    prices.json                Marktpreise, 24 Stunden gültig
    history.json               erzielte Verkaufsdurchschnitte, 72 Stunden gültig
    basarimsiz.json            Spiele ohne Errungenschaften
    chromium/                  Bild- und Seitencache
    steamedge.log              das Protokoll für einen Fehlerbericht
```

> **Empfindlich ist `settings/`.** In `session.json` liegt ein Token, das ausreicht, um dein Konto zu benutzen. Es gehört nicht in ein geteiltes Backup, ein hochgeladenes Archiv oder einen Screenshot.

---

## 📦 Installation

### Voraussetzungen

Windows 10 oder neuer, 64 Bit. Ein Steam-Konto mit aktiviertem Steam Guard. Etwa 330 MB Speicherplatz nach dem Entpacken. Der Steam-Client wird nicht gebraucht und nie gestartet.

### Schritt für Schritt

1. Lade das neueste `.rar` von der [Veröffentlichungsseite](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Entpacke es in einen Ordner, der dir gehört. Nicht `Program Files`, denn die Anwendung schreibt ihre Einstellungen neben sich selbst.
3. Starte `SteamEdge.exe`.
4. Melde dich an. Der QR-Weg ist der einfachere: Code mit der Steam-App scannen und bestätigen. Der Passwort-Reiter will Benutzernamen, Passwort und einen Steam-Guard-Code.

### Installation prüfen

Unten links steht `SYSTEM: BEREIT`, sobald eine Sitzung steht, und `SYSTEM: LÄUFT`, solange eine Aufgabe läuft, und oben rechts füllt sich die Kontoplakette mit Name, Avatar und Level. Bleibt sie leer, ist die Sitzung nicht zustande gekommen; siehe [Fehlerbehebung](#-fehlerbehebung).

### Aktualisieren

Die App prüft die veröffentlichte Versionsnummer und meldet, wenn es eine neuere gibt. Sie lädt bewusst nichts herunter und installiert nichts. Zum Aktualisieren SteamEdge schließen, das neue Archiv in einen **leeren, neuen Ordner** entpacken und den Ordner `settings/` aus dem alten hineinkopieren. Wer über den alten Ordner entpackt, während die App läuft, mischt Dateien zweier Versionen; den häufigsten Fall erkennt die App und meldet ihn beim Start.

### Deinstallieren

Ordner löschen. Das ist der ganze Vorgang.

---

## 🖥️ Rundgang durch die Oberfläche

### Übersicht

Die Startseite. Die Kachel **Aktive Aufgabe** zeigt, was tatsächlich läuft, eine Aufgabe nach der anderen, mit Pfeilen zum Blättern, wenn mehrere gleichzeitig laufen. Start, Stopp und Details wirken auf die Aufgabe, die du gerade siehst, nicht auf eine feste Seite.

Darüber sechs Kacheln: verbleibende Karten, Bibliothek, diese Sitzung, Inventarwert, Stunden-Booster und Errungenschaften. **Letzte Aktivität** links listet, was passiert ist, mit Status und Uhrzeit; **Schnellaktionen** unter dem Aktive-Aufgabe-Bereich aktualisieren Spieleliste, Inventar oder Markt und öffnen die Einstellungen. Eine Kachel zeigt einen Strich, solange ihre Seite nicht geladen ist; das sagt etwas darüber, was abgerufen wurde, nicht über dein Konto.

### Kartenfarming

Die Warteschlange der Spiele mit verbleibenden Karten, aus deinen Abzeichenseiten gelesen, filterbar nach 1-2 oder 3+ Karten. Mit den Pfeilen oder **Nach vorn** umsortieren, mit ✕ entfernen. Rechts: Farm-Modus, Sitzungs-Timer mit Schnellwahl, **Automatisierung** (erhaltene Karten automatisch anbieten, im Hintergrund farmen, bei Kartendrop benachrichtigen, Errungenschaften beim Stundensammeln freischalten) und **Letzte Drops**. Starten drücken.

### Inventar & Markt

Dein Steam-Inventar, Duplikate als eine Zeile, filterbar nach Spiel, Name, Typ, Status und Preis, wahlweise nach Spiel gruppiert. **Preise abrufen** und **Durchschnitte holen** laden die Marktdaten Objekt für Objekt, beide Werte zusammen. Der Detailbereich zeigt aktuelle Angebote, den Preis für einen Sofortverkauf und abgeschlossene Verkäufe. Die Leiste unten summiert Auswahl, Brutto und was du erhältst, und bietet die Verkaufsmodi (vom Durchschnitt, unterbieten, günstigstes Angebot, sofort verkaufen, eigener Preis) vor **Verkaufen**.

### Stunden-Booster

Links die ganze Bibliothek, durchsuchbar; in der Mitte die aktive Warteschlange. Rechts: **Stundenabgleich** (Ziel und Verfahren), das Gleichzeitig-Limit (2, 8, 16, 32 oder eigen), die Dauer mit Schnellwahl, Verhaltensschalter und Offline erscheinen. Eine gewählte Dauer beendet die Sitzung, wenn sie abläuft; ∞ läuft, bis du stoppst. Eine Auswahl lässt sich als Vorlage speichern.

### Realistischer Modus

Ein dreispaltiger Arbeitsbereich unter einer Leiste mit Spiel, freigeschalteter Anzahl, durchschnittlichem Abstand und Gesamtfortschritt. Links Warteschlange, Sitzungsdauer und AUTO-Ziel, in der Mitte die Freischaltreihenfolge mit der nächsten Errungenschaft oben, rechts die Einstellungen, geteilt in Einfach und Erweitert.

### Errungenschaften

Pro Spiel der echte gesperrte und freigeschaltete Zustand aus dem Protokoll, oben die Summen, Filter für Status und Seltenheit, Raster- oder Listenansicht und ein Detailbereich. Errungenschaften auswählen und gesammelt freischalten oder wieder sperren; die Leiste unten zeigt Auswahl, geschätzte Zeit und ob der sichere Modus die Freischaltungen verteilt. Der Fortschritt ist live, Stoppen greift auch mitten in einer Wartezeit.

### Einstellungen

Alles, was man der App sagen kann, gruppiert: Allgemein, Karten farmen, Markt, Inventar, Stunden-Booster, Errungenschaften, Benachrichtigungen, Datenschutz & Sicherheit, Statistiken, Erweitert & Daten und Über. Die rechte Spalte zeigt das Konto (Level, Verbindungsstatus, kopierbare Steam-IDs) und die Konfiguration (letzte Speicherung, ungespeicherte Änderungen).

Änderungen bleiben auf der Seite, bis du **Speichern** drückst. Vorher wird nichts geschrieben, und wer die Seite mit ungespeicherten Änderungen verlässt, wird gefragt. Nach dem Speichern pausieren laufendes Kartenfarmen oder Stunden-Boosten etwa fünf Sekunden und machen mit denselben Spielen und den neuen Werten weiter. **Zurücksetzen** lädt die Standardwerte in die Seite und wartet ebenfalls auf Speichern; die App-Sprache bleibt.

Das Farbschema (Dunkel, Mitternachtslila, Weiß) steht unter Allgemein und gilt auch für den Anmeldebildschirm.

### Chat

Wird über die Chat-Schaltflaeche oben rechts geoeffnet, nicht ueber die Seitenleiste. Links die Freunde, die Online-Kontakte zuerst, rechts die Unterhaltung. Enter sendet, Shift+Enter beginnt eine neue Zeile. Ungelesene Nachrichten erscheinen in der Freundeszeile und auf der Schaltflaeche in der oberen Leiste.

---

## 🧩 Funktionsreferenz

### Kartenfarming

Steam lässt keine Karten fallen, bevor ein Spiel **zwei Stunden** Gesamtspielzeit überschritten hat. Alle Modi bis auf einen ignorieren das und lassen die Spiele einfach laufen; der **schnelle Modus** weiß es und rotiert nur Spiele, die die Schwelle bereits überschritten haben, damit keine Zeit an Spielen verloren geht, die noch gar nichts fallen lassen können.

Haben alle Spiele der Warteschlange keine Karten mehr, oder ist **Nach einem Spiel zum nächsten wechseln** aus und das aktuelle Spiel fertig, stoppt das Farmen und sagt warum, statt das letzte Spiel neu zu starten. Kartenfarming und Stunden-Booster können gleichzeitig laufen: Jeder hält seine eigenen Spiele, Steam sieht beide bis zu seinem Limit von 32.

Die Modi:

| Modus | Was er tut |
|---|---|
| Nacheinander | Ein Spiel nach dem anderen, in Listenreihenfolge |
| Meiste Karten | Spiele mit den meisten verbleibenden Karten zuerst |
| Wenigste Karten | Spiele, die am nächsten am Abschluss sind, zuerst |
| Priorität | Deine eigene Reihenfolge |
| Schnell | Nur Spiele über zwei Stunden, in kurzen Abständen rotiert |

Karten kommen nicht nach Plan, und Steam sendet kein Ereignis "eine Karte ist gefallen". Die Anwendung misst regelmäßig die Summe der verbleibenden Karten und meldet die ehrliche Differenz statt eines erfundenen Zählers.

### Stunden-Booster

Lässt bis zu 32 Spiele gleichzeitig laufen. Steam rechnet die Zeit jedem offenen Spiel einzeln an, 32 Spiele eine Stunde offen sind also 32 Stunden Spielzeit.

**Stundenabgleich** zieht eine Auswahl auf dieselbe Gesamtzeit. Zwei Verfahren:

- **Alle zugleich** - jedes ausgewählte Spiel läuft gleichzeitig und fällt heraus, sobald es das Ziel erreicht. Der schnellstmögliche Weg: der ganze Auftrag dauert so lange wie das am weitesten zurückliegende Spiel.
- **Nacheinander** - das am weitesten zurückliegende Spiel wird allein vorgezogen, und sobald es das nächste eingeholt hat, laufen beide zusammen weiter. Langsamer, aber die Spiele bleiben unterwegs auf gleicher Höhe.

Die Fortschrittsbalken liegen auf einer gemeinsamen Zeitachse: ein Balken ist eins minus der Restzeit des Spiels geteilt durch die Länge des gesamten Auftrags. Ein Spiel, das vier Stunden in einen 35-Stunden-Lauf hinein fertig ist, startet fast voll; eines, das bis zum Ende läuft, startet leer. Jeder erreicht genau dann 100%, wenn sein Spiel das Ziel erreicht.

### Errungenschaften

Errungenschaften werden über das Protokoll gelesen und geschrieben, nicht durch Auslesen deines öffentlichen Profils. Ein privates Profil macht keinen Unterschied.

Zwei Kategorien lassen sich nicht anfassen, und die Anwendung erkennt beide am Schema, statt wiederholt zu scheitern:

- **Geschützte Errungenschaften** schreibt der Spielserver. Steam weist jeden Client ab, der es versucht.
- **Spiele ohne Statistik über dieses Protokoll** (einige große Mehrspielertitel) melden `0 / N`. Das ist richtig, kein Fehler.

Manche Spiele nehmen Schreibvorgänge für Errungenschaften nur an, während das Spiel offen ist. Die Anwendung öffnet das Spiel für den Schreibvorgang und stellt danach wieder her, was vorher lief.

### Realistischer Modus

Hält ein Spiel offen und schaltet seine Errungenschaften über die Sitzung verteilt frei, vom häufigsten zum seltensten. Es geht um die Spur, die das hinterlässt: Hunderte Errungenschaften innerhalb einer Minute fallen im Profil und auf Drittanbieterseiten sofort auf.

**100%-Abschlusszeit** ist die Zahl, auf der die ganze Seite aufbaut: wie viele Stunden es dauert, dieses Spiel mit allen Errungenschaften abzuschließen. Trägst du sie ein, wird sie für dieses Spiel gemerkt. Lässt du sie leer, wird sie aus dem Spieltyp geschätzt, aber diese Schätzung ist deine eigene Spielzeit mal einem Faktor und fällt daher bei viel gespielten Spielen zu hoch aus.

**Zielanzahl** ergibt sich aus zwei Teilen: was bei deiner Spielzeit bereits freigeschaltet sein sollte, minus dem, was es tatsächlich ist, plus dem Anteil dieser Sitzung. Das Feld schreibt die Rechnung aus, damit du sie prüfen kannst.

**Verteilungsmodell** formt die Abstände. Linear ist gleichmäßig, exponentiell lädt vorne auf, wie die ersten Stunden eines echten Spielers aussehen, Pareto legt die meisten in das erste Fünftel.

**Das Tempo** ist nach Seltenheit gewichtet. Nur Errungenschaften unter 5% warten merklich länger, alles darüber behält einen gleichmäßigen, zügigen Rhythmus. Ein Spiel, das über seine Abschlusszeit hinaus gespielt wurde, staucht den ganzen Plan, denn es gibt keine Lernkurve mehr nachzuahmen.

**Spiele ohne Errungenschaften** fallen aus der Warteschlange, sobald das feststeht, werden nach `cache/basarimsiz.json` geschrieben und auf dieser Seite nie wieder angeboten. Das Bibliotheks-Flag, das Steam veröffentlicht, ist nicht verlässlich; nur die Schema-Anfrage ist es.

### Inventar und Markt

Der Gegenstandswert ist der **mengengewichtete Median der erzielten Verkäufe**, nicht das niedrigste aktive Angebot. Eine einzelne Person, die eine Karte für 999.999 einstellt, verschiebt ihn nicht.

Preise kommen in der **Währung deines Guthabens** an und werden genau so angezeigt. Es wird bewusst nicht umgerechnet: Umrechnen hieße, einen Wechselkurs zu erfinden.

Preis und Verkaufsdurchschnitt werden **pro Gegenstand gemeinsam** geholt, dann geht die Warteschlange zum nächsten. Beide teilen sich Steams einziges Marktbudget, und das Limit wird in Anfragen gezählt, nicht in Gegenständen. Der Abstand zwischen Anfragen steht unter Einstellungen > Erweitert & Daten; Steams Toleranz unterscheidet sich je Konto.

**Verkaufen.** Du wählst den Preis, den der Käufer zahlt; was du erhältst, berechnet Steams eigenes Gebührenskript (von Steam geladen, in einem abgeschotteten Fenster ausgeführt), daher stimmen beide mit der Steam-Website überein. Massenverkäufe stoppen, sobald Steam ein Angebot ablehnt, und der Dialog nennt Steams Grund: Neue Konten können nach 10-15 Angeboten gestoppt werden, ältere stellen 80 oder mehr ein. **Stapelgröße** und **Wartezeit zwischen Stapeln** (Einstellungen > Markt) teilen große Verkäufe; ohne Wartezeit wirst du nach jedem Stapel gefragt. Mit aktivem mobilen Authentifikator muss jedes Angebot weiterhin in der Steam-App bestätigt werden.

**Preissturz-Warnung.** Liegt das günstigste Angebot eines Objekts mindestens um die **Preissturz-Schwelle** (Standard 10 %) unter Steams 24-Stunden-Durchschnitt, wird es mit einem roten ▼ markiert, die Verkaufsbestätigung warnt rot, und mit aktiver Warnung kommt höchstens einmal täglich pro Objekt eine Benachrichtigung.

### Chat

Freundesnachrichten laufen ueber dasselbe Netzwerkprotokoll wie alles andere hier, ein Steam-Client ist nicht beteiligt. Das Oeffnen einer Unterhaltung markiert sie bei Steam als gelesen, und dein Gegenueber sieht die Schreibanzeige.

**Gruppenchats sind nicht Teil davon.** Sie sind im Protokoll ein eigenes Konzept (chat room groups) und brauchen einen eigenen Bildschirm.

### Mehrere Konten

Mehrere Konten können gleichzeitig verbunden sein. Jedes hat seine eigene Verbindung, seine eigenen Warteschlangen und seine eigene Datendatei. Ein Kontowechsel startet die Anwendung nicht neu und unterbricht nicht, was die anderen Konten tun. Aus den Einstellungen exportierte Sicherungen enthalten Statistiken, Stunden-Booster-Liste sowie Warteschlange und Vorlagen des Realistischen Modus jedes Kontos.

### Verbindung

Bricht die Verbindung ab, verbindet sich SteamEdge selbst neu und laufende Aufgaben machen weiter. **Bei Verbindungsabbruch neu verbinden** (Einstellungen > Erweitert & Daten) legt das Limit fest: unbegrenzt, 10 Versuche, 3 Versuche oder aus. Beendet Steam die Sitzung endgültig, etwa weil sich das Konto anderswo angemeldet hat, enden die Versuche und ein Banner bietet einen Neu-verbinden-Knopf.

---

## ⚙️ Einstellungsreferenz

Die Einstellungen liegen in `settings/settings.json`. Alles Folgende ist über die Einstellungsseite bearbeitbar.

### Allgemein

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `language` | `tr` | Sprache der Oberfläche: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Mit Windows starten |
| `theme` | `dark` | Farbschema: `dark`, `midnight` (Mitternachtslila), `white` |
| `preventSleep` | `true` | Verhindert den Ruhezustand, solange Kartenfarming, Stunden-Boost oder der Realistische Modus laufen. Der Bildschirm kann sich trotzdem abschalten und sperren |

### Kartenfarming

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `autoNextGame` | `true` | Zum nächsten Spiel wechseln, wenn eines fertig ist. Aus: Das Farmen stoppt nach dem aktuellen Spiel |
| `cardMaxGames` | `32` | Gleichzeitig offene Spiele |
| `fastMinPlaytimeMin` | `120` | Der schnelle Modus überspringt Spiele darunter |
| `pauseFarmOnBoost` | `false` | Pausiert das Farmen, solange Stunden-Booster oder Realistischer Modus laufen, und setzt es danach fort |

### Markt

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `priceRefreshHours` | `24` | Wie lange ein abgerufener Preis frisch bleibt |
| `historyRefreshHours` | `72` | Wie lange ein Verkaufsdurchschnitt frisch bleibt |
| `fetchAvgWithPrice` | `true` | Durchschnitt im selben Durchgang wie den Preis holen. Aus bedeutet eine Anfrage pro Gegenstand und Durchschnitte nur über die Schaltfläche |
| `bookDepth` | `5` | Orderbuch-Zeilen in der Detailansicht |
| `bulkSellLimit` | `50` | Massenverkäufe werden in Stapel dieser Größe geteilt. `0` stellt ein, bis Steam stoppt |
| `sellBatchWaitMin` | `0` | Minuten zwischen Stapeln. `0` fragt nach jedem Stapel |
| `priceDropThreshold` | `10` | Prozent unter Steams 24-Stunden-Durchschnitt, ab dem ein Preissturz gilt |

### Stunden-Booster

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
| `grTcGame` | `{}` | 100%-Abschlusszeit pro Spiel, in Stunden |
| `grCatchUp` | `true` | Den Rückstand in den Anfang der Sitzung stauchen |
| `grSpeed` | `1` | Geschwindigkeitsfaktor für den ganzen Plan |
| `grUltraMultiplier` | `3` | Wie viel länger Errungenschaften unter 5% warten |
| `grCatchUpShare` | `20` | Anteil der Sitzung für das Aufholen, in Prozent |
| `grFinishedRatio` | `50` | Wie stark der Plan bei einem abgeschlossenen Spiel staucht |
| `grKeepHours` | `true` | Nach den Freischaltungen weiter Stunden sammeln |
| `grSkipUltraRare` | `false` | Errungenschaften unter 5% ganz überspringen |

### Privatsphäre

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `offlineMode` | `false` | Während des Laufs offline erscheinen |
| `hideGameName` | `false` | Zeigen, dass du online bist, aber nicht welches Spiel |

> Offline zu erscheinen ändert, was Freunde sehen. Es kann auch ändern, ob Steam dich als spielend zählt; teste es, bevor du dich in einer langen Sitzung darauf verlässt.

### Erweitert

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `reconnectPolicy` | `unlimited` | Neu verbinden nach Abbruch: `unlimited` (unbegrenzt), `10`, `3`, `off` (aus) |
| `sessionTimeout` | `never` | Trennt nach so vielen Minuten ohne Eingabe. Laufende Aufgaben zählen nicht als Leerlauf |
| `apiRequestDelayMs` | `350` | Kürzester Abstand zwischen Marktanfragen. Niedriger ist schneller, aber näher an Steams Ratenlimit (HTTP 429) |
| `logLevel` | `error` | Was in `cache/steamedge.log` landet: `off`, `error`, `warn`, `info`, `debug` |

### Wo die Einstellungen liegen

Allgemeines in `settings/settings.json`. Alles, was zu einem Konto gehört, also die Auswahl des Stunden-Boosters, Warteschlange und Voreinstellungen des realistischen Modus, das Errungenschaftsprotokoll und die Statistik, liegt in `settings/accounts/<steamID>.json`. Zwischenspeicher sind davon getrennt unter `cache/` und können jederzeit gelöscht werden, ohne dass Einstellungen verloren gehen.

---

## 🔧 Fehlerbehebung

### Die Anwendung öffnet sich und schließt sofort wieder

Es läuft bereits eine Kopie. SteamEdge erlaubt nur eine Instanz. Sieh im Task-Manager nach `SteamEdge.exe` und schließe sie zuerst.

### Die Kontoplakette bleibt leer und nichts lädt

Die Steam-Sitzung ist nicht zustande gekommen. Unter der oberen Leiste erscheint ein Band, wenn die Verbindung abbricht oder wiederholt wird. Hält das an, prüfe zuerst, ob Steam selbst erreichbar ist, und sieh dann in `cache/steamedge.log` nach dem Grund. Hat Steam die Sitzung endgültig beendet, sagt das Banner das und bietet einen Neu-verbinden-Knopf.

### Der Massenverkauf hat mittendrin aufgehört

Steam begrenzt, wie viele Angebote ein Konto erstellen darf; das Limit hängt von Alter, Level und Ansehen des Kontos ab. Der Dialog nennt, was Steam zurückgegeben hat. Bestätige die ausstehenden Angebote in der Steam-App, warte ein paar Stunden oder wähle eine kleinere **Stapelgröße** mit Wartezeit.

### "40 Karten übrig", aber nur eine Handvoll ist gefallen

Karten fallen erst, wenn ein Spiel zwei Stunden Gesamtspielzeit überschreitet, und jedes Spiel hat nur eine begrenzte Anzahl. Eine lange Sitzung mit Spielen, die alle unter zwei Stunden liegen, bringt gar nichts; nimm den schnellen Modus, der nur Spiele über der Schwelle wählt.

### Preise zeigen einen Strich oder füllen sich sehr langsam

Steam erlaubt pro Konto etwa 20 Marktanfragen je 30 Sekunden, geteilt zwischen Preisen, Verkaufsdurchschnitten und Angeboten. Ein großes Inventar dauert deshalb. Mit `fetchAvgWithPrice` kostet jeder Gegenstand zwei Anfragen, ein volles Inventar dauert also doppelt so lange, dafür wartest du keinen zweiten Durchgang auf die Durchschnitte.

### Ein Errungenschaft lässt sich nicht freischalten

Entweder ist er geschützt, das heißt der Spielserver schreibt ihn und kein Client darf das, oder das Spiel führt über dieses Protokoll keine Statistik. Beides wird erkannt und gemeldet statt wiederholt versucht. Der Blockvorgang bricht nach drei Fehlschlägen in Folge ab und nennt den Grund, statt hängengeblieben auszusehen.

### Der realistische Modus schlägt nur ein oder zwei Freischaltungen vor

Die Abschlusszeit ist zu hoch. Leer gelassen wird sie aus deiner Spielzeit geschätzt, ein lange gespieltes Spiel liest sich also als enorm langes Spiel. Trag die echte 100%-Abschlusszeit in das Feld im Hauptbereich ein.

### Ein Protokoll für einen Fehlerbericht sammeln

Das Protokoll ist `cache/steamedge.log` neben der ausführbaren Datei, oder aus den Einstellungen zu öffnen. Es hält Verbindungsereignisse, Warteschlangenentscheidungen und Fehler fest. Es enthält **weder** dein Passwort **noch** dein Sitzungstoken, ist also sicher anzuhängen; sieh es trotzdem durch, bevor du es veröffentlichst. Standardmäßig werden nur Fehler geschrieben; stelle Einstellungen > Erweitert & Daten > **Protokolldatei** auf **Ausführlich (Debug)**, reproduziere das Problem und hänge dann die Datei an.

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

Kopiere den Ordner, alles steckt darin. Denk daran, dass in `settings/` dein Sitzungstoken liegt, kopiere also privat. Die Sicherung unter Einstellungen > Allgemein kann Einstellungen und Kontodaten auch ohne Sitzungstoken in eine Datei exportieren.

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
| **Geschützter Errungenschaft** | Einer, den nur der Spielserver setzen darf, kein Client |
| **Erzielter Verkauf** | Eine abgeschlossene Transaktion, im Gegensatz zu einem aktiven Angebot |
| **Schema** | Steams Definition der Errungenschaften und Statistiken eines Spiels |
| **Sitzungstoken** | Der Nachweis, der dich angemeldet hält. Behandle ihn wie ein Passwort |
| **Tc** | 100%-Abschlusszeit: Stunden, um ein Spiel mit allen Errungenschaften abzuschließen |

---

<div align="center">

[Zurück zur README](../../README.md) · [Fehler melden](https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml)

</div>
