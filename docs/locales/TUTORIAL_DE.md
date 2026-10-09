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

Alles liegt neben der ausführbaren Datei. Nichts wird in die Registrierung oder nach `Program Files` geschrieben; `AppData` dient nur als Ausweichort, wenn der Ordner neben der ausführbaren Datei nicht beschreibbar ist.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              allgemeine Einstellungen
    accounts.json              gespeicherte Konten
    session.json               aktives Sitzungstoken
    accounts/<steamID>.json    pro Konto: Statistik, Warteschlangen, Voreinstellungen, Errungenschaftsprotokoll
    stats.json, state.json     nur von älteren Versionen: einmal gelesen, nie wieder geschrieben
    *.bak, *.bozuk             automatische Sicherungskopie und beiseitegelegte defekte Datei
  cache/
    prices.json                Marktpreise, 24 Stunden gültig
    history.json               erzielte Verkaufsdurchschnitte, 72 Stunden gültig
    no-achievements.json            Spiele ohne Errungenschaften
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

Die App prüft die veröffentlichte Versionsnummer einige Sekunden nach dem Start und jedes Mal, wenn du in der oberen Leiste auf die Aktualisieren-Schaltfläche drückst, und meldet, wenn es eine neuere gibt. Sie lädt bewusst nichts herunter und installiert nichts. Zum Aktualisieren SteamEdge schließen, das neue Archiv in einen **leeren, neuen Ordner** entpacken und den Ordner `settings/` aus dem alten hineinkopieren. Wer über den alten Ordner entpackt, während die App läuft, mischt Dateien zweier Versionen; den häufigsten Fall erkennt die App und meldet ihn beim Start.

Dateien, die eine ältere Version geschrieben hat, werden beim ersten Lesen umgewandelt; es genügt also, `settings/` zu kopieren. Die Umwandlung gilt nur in eine Richtung: Hat 1.4.0 einen `settings/`-Ordner einmal geöffnet, kann 1.3.x ihn nicht mehr verwenden. Bewahre eine Kopie auf, falls du zurückwechseln möchtest.

### Deinstallieren

Ordner löschen. Das ist der ganze Vorgang.

---

## 🖥️ Rundgang durch die Oberfläche

### Übersicht

Die Startseite. Die Kachel **Aktive Aufgabe** zeigt, was tatsächlich läuft, eine Aufgabe nach der anderen, mit Pfeilen zum Blättern, wenn mehrere gleichzeitig laufen. Start, Stopp und Details wirken auf die Aufgabe, die du gerade siehst, nicht auf eine feste Seite.

Darüber sechs Kacheln: verbleibende Karten, Bibliothek, diese Sitzung, Inventarwert, Stunden-Booster und Errungenschaften. **Letzte Aktivität** links listet, was passiert ist, mit Status und Uhrzeit (die letzten 30 Einträge, über Sitzungen hinweg gespeichert); **Schnellaktionen** unter dem Aktive-Aufgabe-Bereich aktualisieren Spieleliste, Inventar oder Markt und öffnen die Einstellungen. Eine Kachel zeigt einen Strich, solange ihre Seite nicht geladen ist; das sagt etwas darüber, was abgerufen wurde, nicht über dein Konto.

### Karten farmen

Die Warteschlange der Spiele mit verbleibenden Karten, aus deinen Abzeichenseiten gelesen, filterbar nach 1-2 oder 3+ Karten. Mit den Pfeilen oder **Ganz nach oben** umsortieren (der Modus wechselt dabei zu Priorität), mit ✕ entfernen; Reihenfolge und Entfernungen werden gemerkt. Rechts: Farm-Modus, Timer pro Spiel (wie lange jedes Spiel läuft, bevor das nächste übernimmt, mit Schnellwahl; der schnelle Modus hat seinen eigenen Rhythmus und blendet den Timer aus), **Automatisierung** (erhaltene Karten automatisch anbieten, im Hintergrund farmen, bei Kartendrop benachrichtigen, Errungenschaften beim Stundensammeln freischalten) und **Letzte Drops**. Starten drücken.

### Inventar & Markt

Dein Steam-Inventar, Duplikate als eine Zeile, filterbar nach Spiel, Name, Typ, Status und Preis, wahlweise nach Spiel gruppiert. **Preise abrufen** lädt die Marktpreise dessen, was der aktuelle Filter zeigt, standardmäßig zusammen mit dem Verkaufsdurchschnitt jedes Gegenstands; **Durchschnitte holen** füllt nur fehlende Durchschnitte nach, nennt vorher die geschätzte Dauer und lässt sich abbrechen. Der Detailbereich zeigt aktuelle Angebote, den Preis für einen Sofortverkauf und abgeschlossene Verkäufe. Die Leiste unten summiert Auswahl, Brutto und was du erhältst, und bietet die Verkaufsmodi (vom Durchschnitt, unterbieten, günstigstes Angebot, sofort verkaufen, eigener Preis) vor **Verkaufen**.

### Stunden-Booster

Links die ganze Bibliothek, durchsuchbar (es werden höchstens 300 Zeilen gleichzeitig gezeichnet, zum Eingrenzen also suchen); in der Mitte die aktive Warteschlange. Rechts: **Stundenabgleich** (Ziel und Verfahren), das Gleichzeitig-Limit (2, 8, 16, 32 oder eigen), die Dauer mit Schnellwahl (6, 12, 18, 24 Stunden, ∞ oder eigen), Verhaltensschalter und Offline erscheinen. Eine gewählte Dauer beendet die Sitzung, wenn sie abläuft; ∞ läuft, bis du stoppst. Eine Auswahl lässt sich als Vorlage speichern.

### Realistischer Modus

Ein dreispaltiger Arbeitsbereich unter einer Leiste mit Spiel, freigeschalteter Anzahl, durchschnittlichem Abstand und Gesamtfortschritt. Links Warteschlange, Sitzungsdauer und AUTO-Ziel, in der Mitte die Freischaltreihenfolge mit der nächsten Errungenschaft oben, rechts die Einstellungen, geteilt in Einfach und Erweitert.

### Errungenschaften

Pro Spiel der echte gesperrte und freigeschaltete Zustand aus dem Protokoll, oben die Summen, Filter für Status und Seltenheit, Raster- oder Listenansicht und ein Detailbereich. Errungenschaften auswählen und gesammelt freischalten oder wieder sperren; die Leiste unten zeigt Auswahl, geschätzte Zeit und ob der sichere Modus die Freischaltungen verteilt. Der Fortschritt ist live, Stoppen greift auch mitten in einer Wartezeit.

### Einstellungen

Alles, was man der App sagen kann, gruppiert: Allgemein, Karten farmen, Markt, Inventar, Stunden-Booster, Errungenschaften, Benachrichtigungen, Datenschutz & Sicherheit, Statistiken, Erweitert & Daten und Über. Die rechte Spalte zeigt das Konto (Level, Verbindungsstatus, kopierbare Steam-IDs) und die Konfiguration (letzte Speicherung, ungespeicherte Änderungen).

Änderungen bleiben auf der Seite, bis du **Speichern** drückst. Vorher wird nichts geschrieben, und wer die Seite mit ungespeicherten Änderungen verlässt, wird gefragt. Nach dem Speichern pausiert ein laufendes Kartenfarmen oder Stunden-Boosten, das von den geänderten Einstellungen betroffen ist, etwa fünf Sekunden und macht mit denselben Spielen und den neuen Werten weiter; Einstellungen, die einen laufenden Auftrag nicht berühren, gelten sofort. **Zurücksetzen** lädt die Standardwerte in die Seite und wartet ebenfalls auf Speichern; die App-Sprache bleibt.

Das Farbschema (Dunkel, Mitternachtslila, Weiß) steht unter Allgemein und gilt auch für den Anmeldebildschirm.

### Chat

Wird über die Chat-Schaltfläche oben rechts geöffnet, nicht über die Seitenleiste. Links die Freunde, die Online-Kontakte zuerst, rechts die Unterhaltung (beim Öffnen werden die letzten 50 Nachrichten geladen). Enter sendet, Shift+Enter beginnt eine neue Zeile. Ungelesene Nachrichten erscheinen in der Freundeszeile und auf der Schaltfläche in der oberen Leiste.

---

## 🧩 Funktionsreferenz

### Kartenfarming

Steam lässt keine Karten fallen, bevor ein Spiel **zwei Stunden** Gesamtspielzeit überschritten hat. Alle Modi bis auf einen ignorieren das und lassen die Spiele einfach laufen; der **schnelle Modus** weiß es und hebt Spiele unter der Schwelle erst darüber, bevor er zu rotieren beginnt.

In allen Modi außer Schnell läuft immer ein Spiel für die eingestellte **Zeit pro Spiel** (Einstellungen > Karten farmen, Standard 5 Minuten; der Timer auf der Seite Karten farmen startet damit und lässt sich pro Lauf ändern), dann übernimmt das nächste. Ein Spiel ohne verbleibende Karten fällt aus der Warteschlange, das nächste startet sofort. Haben alle Spiele der Warteschlange keine Karten mehr, oder ist **Nach einem Spiel zum nächsten wechseln** aus und die Zeit des aktuellen Spiels ist um oder seine Karten sind alle, stoppt das Farmen und sagt warum, statt das letzte Spiel neu zu starten. Kartenfarming und Stunden-Booster können gleichzeitig laufen: Jeder hält seine eigenen Spiele, Steam sieht beide bis zu seinem Limit von 32.

Der **schnelle Modus** arbeitet in zwei Phasen. Zuerst das Aufwärmen: Spiele unter der Schwelle (`fastMinPlaytimeMin`, 120 Minuten) werden in Gruppen von bis zu **Max. Spiele gleichzeitig** zusammen geöffnet und bleiben offen, bis die ganze Gruppe die Schwelle überschritten hat, weil Steam die Zeit jedem offenen Spiel gleichzeitig anrechnet. Dann bleibt jedes Spiel, das noch Karten hat, bis zum selben Limit gemeinsam offen, und die App wechselt das hervorgehobene Spiel alle 90 bis 120 Sekunden, jedes Mal mit zufälligem Abstand.

Die Modi:

| Modus | Was er tut |
|---|---|
| Nacheinander | Ein Spiel nach dem anderen, in Listenreihenfolge |
| Meiste Karten | Spiele mit den meisten verbleibenden Karten zuerst |
| Wenigste Karten | Spiele, die am nächsten am Abschluss sind, zuerst |
| Priorität | Deine eigene Reihenfolge |
| Schnell | Aufwärmen für Spiele unter zwei Stunden, dann alle gemeinsam offen mit wechselndem Hauptspiel |

Karten kommen nicht nach Plan, und Steam sendet kein Ereignis "eine Karte ist gefallen". Die App liest die Abzeichenseiten jedes Kontos alle drei Minuten neu und meldet die ehrliche Differenz der verbleibenden Karten statt eines erfundenen Zählers.

### Stunden-Booster

Lässt bis zu 32 Spiele gleichzeitig laufen. Steam rechnet die Zeit jedem offenen Spiel einzeln an, 32 Spiele eine Stunde offen sind also 32 Stunden Spielzeit. Der **Sequenzielle Idle-Modus** (ein Schalter auf der Seite) lässt die Warteschlange stattdessen Spiel für Spiel durchlaufen, wobei die eingestellte Dauer für jedes Spiel gilt; deshalb ist dort ∞ nicht wählbar und der Stundenabgleich wird nicht verwendet.

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

**Massenfreischaltung und -sperre** wirken auf die gewählten Errungenschaften, oder auf alles, was der aktuelle Filter zeigt, wenn nichts gewählt ist. Sie werden immer einzeln im **Freischaltintervall** (Einstellungen > Errungenschaften) gesendet, nie als ein Schub. Bei aktivem **Sicherer Modus** schwankt jede Wartezeit zufällig um bis zu 40 % in beide Richtungen, mit **Freischaltungen zeitlich verteilen** zwischen 40 % und 160 % des Intervalls; bei ausgeschaltetem sicheren Modus gilt das Intervall exakt. Die Bestätigung zeigt Intervall und geschätzte Gesamtdauer, ein Massenlauf stoppt nach drei Fehlern in Folge, und am Ende liest die App das Spiel neu von Steam und korrigiert jede Markierung, die Steam nicht wirklich gespeichert hat. Eine einzelne Freischaltung fragt zuerst, außer du hast Nicht mehr fragen angehakt (**Bei Einzeländerungen bestätigen** in den Einstellungen schaltet es wieder ein); Massenläufe fragen immer. Die Seltenheit folgt Steams globalem Freischaltanteil in fünf Stufen: unter 1 % Legendär, unter 5 % Ultra selten, unter 10 % Selten, unter 25 % Ungewöhnlich, der Rest Häufig.

### Realistischer Modus

Hält ein Spiel offen und schaltet seine Errungenschaften über die Sitzung verteilt frei, vom häufigsten zum seltensten. Es geht um die Spur, die das hinterlässt: Hunderte Errungenschaften innerhalb einer Minute fallen im Profil und auf Drittanbieterseiten sofort auf.

**100%-Abschlusszeit** ist die Zahl, auf der die ganze Seite aufbaut: wie viele Stunden es dauert, dieses Spiel mit allen Errungenschaften abzuschließen. Trägst du sie ein, wird sie für dieses Spiel gemerkt. Lässt du sie leer, wird sie aus dem Spieltyp geschätzt, aber diese Schätzung ist deine eigene Spielzeit mal einem Faktor und fällt daher bei viel gespielten Spielen zu hoch aus.

**Zielanzahl** ergibt sich aus zwei Teilen: was bei deiner Spielzeit bereits freigeschaltet sein sollte, minus dem, was es tatsächlich ist, plus dem Anteil dieser Sitzung. Das Feld schreibt die Rechnung aus, damit du sie prüfen kannst. Ist **Dauer aus den Einstellungen bestimmen** an und hast du die Dauer nicht von Hand eingetragen, wird auch die Sitzungslänge berechnet: die Zeit, die ein echter Spieler für die zurückliegenden Errungenschaften bräuchte, begrenzt auf 15 Minuten bis 12 Stunden.

**Verteilungsmodell** formt die Abstände. Linear ist gleichmäßig, exponentiell lädt vorne auf, wie die ersten Stunden eines echten Spielers aussehen, Pareto legt die meisten in das erste Fünftel.

**Das Tempo** ist nach Seltenheit gewichtet. Nur Errungenschaften unter 5% warten merklich länger, alles darüber behält einen gleichmäßigen, zügigen Rhythmus. Ein Spiel, das über seine Abschlusszeit hinaus gespielt wurde, staucht den ganzen Plan, denn es gibt keine Lernkurve mehr nachzuahmen.

**Spiele ohne Errungenschaften** fallen aus der Warteschlange, sobald das feststeht, werden nach `cache/no-achievements.json` geschrieben und auf dieser Seite nie wieder angeboten. Das Bibliotheks-Flag, das Steam veröffentlicht, ist nicht verlässlich; nur die Schema-Anfrage ist es.

Mit **Zufällige Abstände** schwanken die Abstände um bis zu 40 % in beide Richtungen und sind nie kürzer als drei Sekunden. Stehen mehrere Spiele in der Warteschlange, wird die Restzeit nach Anzahl der Errungenschaften aufgeteilt, und die Warteschlange rückt von selbst vor, wenn **Warteschlange automatisch starten** an ist. Läuft die Zeit ab, obwohl noch Errungenschaften übrig sind, endet der Lauf und nennt, wie viele nicht freigeschaltet wurden, statt sie zu erzwingen; ein dafür pausiertes Kartenfarmen wird danach fortgesetzt.

### Inventar und Markt

Der Gegenstandswert ist der **mengengewichtete Median der erzielten Verkäufe**, nicht das niedrigste aktive Angebot. Eine einzelne Person, die eine Karte für 999.999 einstellt, verschiebt ihn nicht.

Preise kommen in der **Währung deines Guthabens** an und werden genau so angezeigt. Es wird bewusst nicht umgerechnet: Umrechnen hieße, einen Wechselkurs zu erfinden.

Preis und Verkaufsdurchschnitt werden **pro Gegenstand gemeinsam** geholt, dann geht die Warteschlange zum nächsten. Beide teilen sich Steams einziges Marktbudget, und das Limit wird in Anfragen gezählt, nicht in Gegenständen; die App sendet 18 Anfragen und wartet dann Steams Abkühlzeit von etwa 32 Sekunden ab. Der Abstand zwischen Anfragen steht unter Einstellungen > Erweitert & Daten; Steams Toleranz unterscheidet sich je Konto.

**Verkaufen.** Du wählst den Preis, den der Käufer zahlt; was du erhältst, berechnet Steams eigenes Gebührenskript (von Steam geladen, in einem abgeschotteten Fenster ausgeführt), daher stimmen beide mit der Steam-Website überein. Ein Massenverkauf stoppt, wenn Steam ein Limit meldet oder zwei Angebote in Folge ablehnt, und der Dialog nennt Steams Grund: Neue Konten können nach 10-15 Angeboten gestoppt werden, ältere stellen 80 oder mehr ein. Gegenstände, die Steam gerade nicht einstellen lässt (zum Beispiel solche mit bereits wartendem Angebot), stoppen den Lauf nicht; sie werden übersprungen und gezählt. **Stapelgröße** und **Wartezeit zwischen Stapeln** (Einstellungen > Markt) teilen große Verkäufe; ohne Wartezeit wirst du nach jedem Stapel gefragt. Mit aktivem mobilen Authentifikator muss jedes Angebot weiterhin in der Steam-App bestätigt werden.

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

Die Einstellungen liegen in `settings/settings.json`. Die meisten der folgenden Schlüssel sind Bedienelemente der Einstellungsseite; die aufgabenspezifischen (Dauer und Abgleichverfahren des Stunden-Boosters, Werte des realistischen Modus) liegen auf der Seite ihrer Funktion. Mit * markierte Schlüssel haben gar kein Bedienelement und werden nur geändert, indem man die Datei bei geschlossener App bearbeitet. Die Tabellen führen die wissenswerten Schlüssel auf; der Rest sind die übrigen Bedienelemente dieser Seiten, und die Datei wird bei jedem Klick auf Speichern neu geschrieben.

### Allgemein

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `language` | `en` | Sprache der Oberfläche: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Mit Windows starten |
| `theme` | `dark` | Farbschema: `dark`, `midnight` (Mitternachtslila), `white` |
| `preventSleep` | `false` | Verhindert den Ruhezustand, solange Kartenfarming, Stunden-Boost oder der Realistische Modus laufen. Der Bildschirm kann sich trotzdem abschalten und sperren |

### Kartenfarming

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `autoNextGame` | `true` | Zum nächsten Spiel wechseln, wenn eines fertig ist. Aus: Das Farmen stoppt nach dem aktuellen Spiel |
| `cardMaxGames` | `32` | Gleichzeitig offene Spiele |
| `farmMaxMinutes` | `5` | Minuten, die jedes Spiel läuft, bevor das nächste übernimmt. Der schnelle Modus hat seinen eigenen Rhythmus |
| `fastMinPlaytimeMin`* | `120` | Der schnelle Modus hebt Spiele unter dieser Spielzeit zuerst darüber, dann rotiert er alle |

### Markt

| Schlüssel | Standard | Wirkung |
|---|---|---|
| `priceRefreshHours`* | `24` | Wie lange ein abgerufener Preis frisch bleibt |
| `historyRefreshHours`* | `72` | Wie lange ein Verkaufsdurchschnitt frisch bleibt |
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
| `rememberBoostList` | `true` | Auswahl zwischen Sitzungen behalten |
| `pauseFarmOnBoost` | `false` | Pausiert das Farmen, solange Stunden-Booster oder Realistischer Modus laufen, und setzt es danach fort |

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
| `sessionTimeout` | `never` | Schließt alle Sitzungen nach so vielen Minuten ohne Eingabe (30, 120 oder 480). Laufende Aufgaben zählen nicht als Leerlauf; nur deine eigene Eingabe setzt den Timer zurück. Läuft er ab, trennen alle Konten, die aktive Sitzung wird vergessen und der Anmeldebildschirm öffnet sich |
| `apiRequestDelayMs` | `350` | Kürzester Abstand zwischen Marktanfragen. Niedriger ist schneller, aber näher an Steams Ratenlimit (HTTP 429) |
| `logLevel` | `error` | Was in `cache/steamedge.log` landet: `off`, `error`, `warn`, `info`, `debug` |

### Wo die Einstellungen liegen

Allgemeines in `settings/settings.json`. Alles, was zu einem Konto gehört, also die Auswahl des Stunden-Boosters, Warteschlange und Voreinstellungen des realistischen Modus, das Errungenschaftsprotokoll und die Statistik, liegt in `settings/accounts/<steamID>.json`. Zwischenspeicher sind davon getrennt unter `cache/` und können jederzeit gelöscht werden, ohne dass Einstellungen verloren gehen. Jede JSON-Datei wird zuerst in eine temporäre Datei geschrieben und dann in einem Schritt ausgetauscht, die vorherige intakte Kopie bleibt daneben als `.bak`. Lässt sich eine Datei nicht lesen, wird die `.bak` benutzt; ist auch sie defekt, bleibt die Datei unangetastet, eine Kopie wird als `.bozuk` beiseitegelegt, die App meldet es beim Start und die betroffenen Daten beginnen mit den Standardwerten. `stats.json` und `state.json` gibt es nur in Ordnern älterer Versionen; ihr Inhalt wandert beim ersten Mal in die Kontodatei, danach werden sie nie wieder geschrieben.

---

## 🔧 Fehlerbehebung

### Die Anwendung öffnet sich und schließt sofort wieder

Es läuft bereits eine Kopie. SteamEdge erlaubt nur eine Instanz. Sieh im Task-Manager nach `SteamEdge.exe` und schließe sie zuerst.

### Die Kontoplakette bleibt leer und nichts lädt

Die Steam-Sitzung ist nicht zustande gekommen. Unter der oberen Leiste erscheint ein Band, wenn die Verbindung abbricht oder wiederholt wird. Hält das an, prüfe zuerst, ob Steam selbst erreichbar ist, und sieh dann in `cache/steamedge.log` nach dem Grund. Hat Steam die Sitzung endgültig beendet, sagt das Banner das und bietet einen Neu-verbinden-Knopf.

### Der Massenverkauf hat mittendrin aufgehört

Steam begrenzt, wie viele Angebote ein Konto erstellen darf; das Limit hängt von Alter, Level und Ansehen des Kontos ab. Der Dialog nennt, was Steam zurückgegeben hat. Bestätige die ausstehenden Angebote in der Steam-App, warte ein paar Stunden oder wähle eine kleinere **Stapelgröße** mit Wartezeit.

### "40 Karten übrig", aber nur eine Handvoll ist gefallen

Karten fallen erst, wenn ein Spiel zwei Stunden Gesamtspielzeit überschreitet, und jedes Spiel hat nur eine begrenzte Anzahl. Eine lange Sitzung in den anderen Modi mit Spielen, die alle unter zwei Stunden liegen, bringt bis zum Überschreiten der Schwelle gar nichts; der schnelle Modus hebt diese Spiele zuerst gemeinsam darüber.

### Preise zeigen einen Strich oder füllen sich sehr langsam

Steam erlaubt pro Konto etwa 20 Marktanfragen je 30 Sekunden, geteilt zwischen Preisen, Verkaufsdurchschnitten und Angeboten. Ein großes Inventar dauert deshalb. Mit `fetchAvgWithPrice` kostet jeder Gegenstand zwei Anfragen, ein volles Inventar dauert also doppelt so lange, dafür wartest du keinen zweiten Durchgang auf die Durchschnitte.

### Ein Errungenschaft lässt sich nicht freischalten

Entweder ist er geschützt, das heißt der Spielserver schreibt ihn und kein Client darf das, oder das Spiel führt über dieses Protokoll keine Statistik. Beides wird erkannt und gemeldet statt wiederholt versucht. Der Blockvorgang bricht nach drei Fehlschlägen in Folge ab und nennt den Grund, statt hängengeblieben auszusehen.

### Der realistische Modus schlägt nur ein oder zwei Freischaltungen vor

Die Abschlusszeit ist zu hoch. Leer gelassen wird sie aus deiner Spielzeit geschätzt, ein lange gespieltes Spiel liest sich also als enorm langes Spiel. Trag die echte 100%-Abschlusszeit in das Feld im Hauptbereich ein.

### SteamEdge meldet, dass eine Datei nicht gelesen werden konnte

Ist eine Einstellungs- oder Datendatei beschädigt, stellt SteamEdge die automatische `.bak`-Kopie wieder her. Ist auch sie beschädigt, bleibt die Datei, wie sie ist, eine Kopie wird daneben mit der Endung `.bozuk` beiseitegelegt, die betroffenen Daten beginnen mit den Standardwerten und die App meldet es beim Start. Nichts wird überschrieben, du kannst die Datei also von Hand zurücklegen.

### Ein Protokoll für einen Fehlerbericht sammeln

Das Protokoll ist `cache/steamedge.log` neben der ausführbaren Datei, oder aus den Einstellungen zu öffnen. Es hält Verbindungsereignisse, Warteschlangenentscheidungen und Fehler fest. Es enthält **weder** dein Passwort **noch** dein Sitzungstoken, ist also sicher anzuhängen; sieh es trotzdem durch, bevor du es veröffentlichst. Standardmäßig werden nur Fehler geschrieben; stelle Einstellungen > Erweitert & Daten > **Protokolldatei** auf **Ausführlich (Debug)**, reproduziere das Problem und hänge dann die Datei an. Das Protokoll ist begrenzt: ab 2 MB wird es als `steamedge.log.1` beiseitegelegt und eine neue Datei beginnt, sodass immer ein älterer Teil erhalten bleibt.

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
