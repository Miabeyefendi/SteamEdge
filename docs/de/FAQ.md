# FAQ

[English](../en/FAQ.md) · [Türkçe](../tr/FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [繁體中文](../zh/FAQ.md)

---

## Sicherheit und Sperren

### Werde ich gesperrt?

Niemand kann dir versprechen, dass das nicht passiert. Hier steht, was tatsächlich stimmt,
damit du selbst entscheiden kannst.

**Was SteamEdge tut:** Es sendet dieselbe `ClientGamesPlayed`-Nachricht, die auch der
offizielle Steam-Client sendet, wenn du ein Spiel startest. Steam sieht ein laufendes Spiel
und schüttet Karten normal aus. Das ist der gesamte Mechanismus.

**Was es nicht tut:** Es verändert keine Spieldateien, greift in keinen Prozess ein, nutzt
keinen Steam-Web-API-Schlüssel, berührt keine anderen Spieler, handelt oder verschenkt
nichts in deinem Namen und interagiert in keiner Weise mit VAC-geschützten Spielen.

**Das ehrliche Risiko:** Dein Konto zu automatisieren verstößt gegen die
[Steam-Nutzungsvereinbarung](https://store.steampowered.com/subscriber_agreement/). Solche
Werkzeuge gibt es seit über einem Jahrzehnt, und Massensperren wegen Kartenfarmen hat es
nicht gegeben - aber "hat es nicht gegeben" ist nicht "kann es nicht geben". Valve kann die
Richtlinien jederzeit ändern. Dieses Risiko trägst du selbst.

### Ist VAC beteiligt?

Nein. VAC-Sperren werden für Cheating in einem laufenden Spielprozess verhängt. SteamEdge
startet nie ein Spiel, es gibt also keinen Prozess, den VAC prüfen könnte.

### Was bringt Leute wirklich in Schwierigkeiten?

Nicht das Kartenfarmen selbst. Was auffällt:

- **Hunderte Errungenschaften in Minuten freischalten.** Das ist öffentlich auf deinem
  Profil sichtbar und Drittanbieterseiten verfolgen es. Nutze den sicheren Modus und ein
  echtes Intervall.
- **Handels- und Marktmissbrauch** - nichts, was diese App tut, aber wer das Farmen
  automatisiert, automatisiert oft auch anderes.
- **Den Ordner `settings/` weitergeben.** Darin liegt dein Anmelde-Token. Wer ihn hat, ist du.

### Wird mein Passwort gespeichert?

Nein. Beim QR-Login tippst du dein Passwort nie ein. Beim Passwort-Login wird es einmal
verwendet, um ein Token zu erhalten, und dann verworfen. Gespeichert wird das von Steam
ausgestellte Aktualisierungs-Token in `settings/session.json`.

Behandle `settings/` wie ein Passwort: nicht hochladen, nicht in freigegebene Ordner legen,
nicht an Fehlerberichte anhängen.

---

## Häufige Probleme

### Windows sagt "Der Computer wurde durch Windows geschützt"

Die EXE ist nicht signiert. Ein Zertifikat kostet mehrere hundert Dollar pro Jahr, was ein
kostenloses Hobbyprojekt nicht hat. Klicke **Weitere Informationen → Trotzdem ausführen**
oder [baue sie selbst](./SETUP.md#selbst-bauen).

### "SteamEdge ist bereits offen" erscheint und die App schließt sich

Es kann immer nur eine Kopie laufen. Liefen zwei gleichzeitig, würde Steam die erste Sitzung
verwerfen (`LogonSessionReplaced`) und die Seiten zeigten "Nicht verbunden". Schließe das
offene Fenster und starte neu.

### Errungenschaften oder Inventar zeigen "Nicht verbunden"

Die Steam-Sitzung wurde von einer anderen Anmeldung übernommen. Meist läuft der Steam-Client
mit demselben Konto oder eine weitere Kopie von SteamEdge. Schließe die andere und drücke
**Erneut versuchen**.

### "Steam-Anfragelimit" in den Marktkästen

Steam erlaubt grob 20 Marktanfragen pro 30 Sekunden und Konto. SteamEdge reiht alles über
eine einzige Schleuse ein, sodass Anfragen sich nie überschneiden - trotzdem kannst du das
Limit erreichen, wenn du viele Objektdetails schnell hintereinander öffnest.

Warte eine Minute und drücke **Erneut versuchen**. Um es zu vermeiden: erst filtern und
**Preise abrufen** nutzen, statt das gesamte Inventar zu laden.

### Preise sehen falsch aus

Preise werden in der Währung deines Steam-Guthabens abgerufen, aus dem Community-Markt
gelesen und genau in dieser Währung angezeigt. Es gibt keine Umrechnung.

Wenn eine Zahl falsch wirkt, prüfe, welchen Kasten du liest:

- **Aktuelle Angebote** ist, was Verkäufer verlangen, und kann absurd sein - jemand kann
  einen Gegenstand für 999.999 $ anbieten.
- **Abgeschlossene Verkäufe** ist, wofür er tatsächlich verkauft wurde. Das ist der echte
  Wert.

### Es fallen keine Karten

Prüfe der Reihe nach:

1. **Hat das Spiel noch Drops übrig?** Drücke Spieleliste aktualisieren.
2. **Liegt das Spiel über 2 Stunden Spielzeit?** Davor schüttet Steam keine Karten aus. Der
   Schnellmodus erledigt das automatisch.
3. **Ist das Konto berechtigt?** Steam verlangt mindestens einen Kauf von 5 $ auf dem Konto,
   bevor es Kartendrops erhalten kann.
4. **Stört eine andere Steam-Sitzung?** Schließe den Steam-Client.

### Die App braucht viel Arbeitsspeicher

Das ist Electron: es laeuft als mehrere Prozesse, deshalb zeigt der Task-Manager mehrere
SteamEdge-Zeilen. Einstellungen → Erweitert → **Belegter Speicher** zaehlt sie zusammen und
zeigt, welcher Prozess wie viel haelt. Auf unserem Rechner liegt eine typische Sitzung bei
insgesamt 200-240 MB.

Zwei Dinge senken das:

- **Hardwarebeschleunigung aus** (Einstellungen → Erweitert). Der Grafikprozess wird
  kleiner; in unserer Messung sank der Gesamtwert von 212 MB auf 163 MB. Gezeichnet wird
  dann von der CPU.
- **Im Hintergrund farmen** (Kartenfarming → Automatisierung). Ist das Fenster
  ausgeblendet, wird die Liste des offenen Tabs freigegeben und bei der Rueckkehr neu
  gezeichnet.

Listen von Tabs, die du gerade nicht ansiehst, werden ohnehin automatisch freigegeben, und
das Neuzeichnen stoppt vollstaendig, solange das Fenster verborgen ist.

### Wie aktualisiere ich?

SteamEdge sieht beim Start einmal in der Release-Liste nach und zeigt nur dann ein Fenster,
wenn eine neuere Version existiert; bist du aktuell, bleibt es still. Die
Download-Schaltflaeche oben wiederholt die Pruefung jederzeit.

Die Anwendung aktualisiert sich nie selbst. Lade das neue Archiv von der Release-Seite,
entpacke es in einen **leeren, neuen Ordner** und kopiere deinen alten `settings/`-Ordner
neben die neue `SteamEdge.exe`. Einstellungen, gespeicherte Konten und Sitzung kommen mit.

Eine neue Version **ueber** den alten Ordner zu entpacken ist das Einzige, was du
vermeiden solltest: Dateien in Benutzung werden uebersprungen, es entsteht eine Mischung
aus zwei Versionen und die Anwendung startet nicht mehr.

### Wo sind meine Dateien?

Neben `SteamEdge.exe`, in `settings/` und `cache/`. Einstellungen → Erweitert →
**Datenordner öffnen** bringt dich hin.

Hast du die App nach `C:\Programme` entpackt, blockiert Windows das Schreiben und die App
weicht auf deinen AppData-Ordner aus. Verschiebe den Ordner an einen beschreibbaren Ort, um
das portable Layout zurückzubekommen.

---

## Funktionen

### Kann ich mehrere Konten gleichzeitig betreiben?

Ja. Avatar-Menü → **Konto hinzufügen**. Alle angemeldeten Konten farmen parallel im
Hintergrund; das Fenster zeigt das Konto, zu dem du wechselst.

### Funktioniert Stunden-Boosting wirklich?

Ja - Steam zählt Spielzeit für jedes gleichzeitig geöffnete Spiel, bis zum bekannten Limit
von 32. Das Limit gilt serverseitig, nicht in dieser App.

### Was ist Stundenabgleich?

Er bringt die Gesamtspielzeit mehrerer Spiele stufenweise auf dieselbe Zahl. Siehe
[Anleitung](./TUTORIAL.md#stundenabgleich).

### Kann ich eine Errungenschaft wieder sperren?

Ja. Das ursprüngliche Freischaltdatum ist dann allerdings dauerhaft verloren.

### Funktioniert es ohne die Steam-Mobil-App?

Ja, aber du musst Steam-Guard-Codes manuell eingeben, und Massen-Marktangebote müssen je
nach Kontoeinrichtung einzeln bestätigt werden.

### Linux / macOS?

Derzeit wird nur Windows gebaut. Der Code ist reines Electron ohne Windows-spezifische
Abhängigkeiten, `npm run build -- --platform=linux` erzeugt also wahrscheinlich einen
lauffähigen Build - ungetestet und ohne Support.

---

## Projekt

### Ist das ein Fork von Idle Master / ASF?

Nein. Es wurde von Grund auf geschrieben. Diese Projekte wurden untersucht, um zu verstehen,
wie Steam funktioniert - es wurde kein Code kopiert. Vollständige Danksagungen im
[README](./README.md#danksagungen).

### Warum AGPL-3.0?

Damit jeder, der die Software weitergibt oder eine veränderte Version als Dienst betreibt,
den Quellcode offen halten muss. Für die Nutzung in einem geschlossenen Produkt wende dich
wegen einer kommerziellen Lizenz an den Autor.

### Wie melde ich einen Fehler?

Öffne ein Issue mit:

1. Was du getan hast, was du erwartet hast, was passiert ist.
2. Deiner SteamEdge-Version (Einstellungen → Über).
3. Deiner Windows-Version.
4. Dem Protokoll: Einstellungen → Erweitert → **Debug-Protokolle behalten** aktivieren,
   Problem reproduzieren, dann `cache/steamedge.log` anhängen.

**Hänge niemals `settings/session.json` oder `settings/accounts.json` an.** Darin steht dein
Anmelde-Token.

Sicherheitslücken: folge [SECURITY.md](../../SECURITY.md), statt ein öffentliches Issue zu
öffnen.

### Wie kann ich helfen?

Übersetzungen, Fehlerberichte und Pull Requests sind willkommen - siehe
[CONTRIBUTING.md](../../CONTRIBUTING.md). Das Oberflächen-Wörterbuch liegt in
`src/main/js/i18n.js`; eine Sprache hinzuzufügen bedeutet, eine Spalte zu ergänzen.
