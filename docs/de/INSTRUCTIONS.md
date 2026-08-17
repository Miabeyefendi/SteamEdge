# Einstellungen - alles erklärt

[English](../en/INSTRUCTIONS.md) · [Türkçe](../tr/INSTRUCTIONS.md) · [Deutsch](../de/INSTRUCTIONS.md) · [Español](../es/INSTRUCTIONS.md) · [繁體中文](../zh/INSTRUCTIONS.md)

Öffne die Einstellungen über das Zahnrad oben rechts. Einstellungen gelten **appweit**,
nicht pro Konto. Jede Zeile hat ein **?**, das beim Überfahren dieselbe Erklärung zeigt wie
hier.

Änderungen werden sofort gespeichert. **Auf Standard zurücksetzen** steht oben.

---

## Allgemein

| Einstellung | Standard | Wirkung |
|---|---|---|
| **App-Sprache** | Türkçe | English, Türkçe, Deutsch, Español, 繁體中文. Die App lädt beim Wechsel neu. |
| **Startseite** | Übersicht | Welcher Tab beim Start geöffnet wird. |
| **Oberflächendichte** | Komfortabel | Kompakt verringert die Zeilenhöhe, etwa ein Drittel mehr Zeilen pro Bildschirm. |
| **Zeitformat** | 24 Stunden | Gilt für Sitzungszähler, Protokollzeiten und Ruhezeiten. |
| **Mit Windows starten** | Aus | Startet SteamEdge bei der Anmeldung, still in die Taskleiste. |
| **Beim Schließen in die Taskleiste** | Aus | Das Fenster zu schließen lässt das Farmen im Hintergrund weiterlaufen. |
| **Ruhezustand verhindern** | Aus | Verhindert Standby und Bildschirmsperre während Farmen oder Boosting. |
| **Seitenleiste eingeklappt starten** | Aus | Nur Symbole; der Inhaltsbereich gewinnt 128 Pixel. |

### Sicherung

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Exportieren / Importieren** | - | Schreibt alle Einstellungen und Gesamtstatistiken in eine `.json`. **Anmelde-Token und gespeicherte Konten sind bewusst ausgeschlossen**, die Datei darf also in die Cloud. |
| **Aufbewahrungsdauer gemerkter Daten** | 90 Tage | Gilt für Warteschlangenreihenfolge, entfernte Spiele und das Errungenschaftsprotokoll. Abgelaufenes wird beim Start gelöscht. Deine Einstellungen sind nicht betroffen. |

### Gefahrenzone

**Alle Daten löschen** entfernt Sitzung, gespeicherte Konten, Einstellungen, Statistiken und
Preis-Cache und kehrt zum Anmeldebildschirm zurück. Dein Steam-Konto bleibt unberührt. Zwei
Bestätigungen erforderlich.

---

## Karten farmen

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Standard-Prioritätsmodus** | Nacheinander | Mit welchem Modus der Tab öffnet. |
| **Standard-Warteschlangenreihenfolge** | Standard | Nach welcher Spalte die Warteschlange beim Öffnen sortiert ist. |
| **Max. Spiele gleichzeitig** | 10 | Wie viele Spiele gleichzeitig als laufend gelten. Das bekannte Limit des Steam-Clients ist 32 - serverseitiges Verhalten, keine Grenze dieser App. Niedrigere Werte brauchen weniger Ressourcen. |
| **Max. Zeit pro Spiel** | 5 Min | Läuft diese Zeit ab, geht es weiter, auch ohne Kartendrop. `0` deaktiviert das Limit. |
| **Wiederholung nach Fehler** | 3 | Wie oft eine abgebrochene Steam-Verbindung erneut versucht wird. Die Wartezeit verdoppelt sich jedes Mal. |
| **Automatisch neu verbinden** | An | Stellt die Sitzung nach einem Internet- oder Steam-Ausfall wieder her und setzt die Warteschlange fort. |
| **Zum nächsten Spiel wechseln** | An | Aus: Du startest jedes Spiel selbst. |

### Automatisierung

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Automatisch im Markt anbieten** | Aus | Bietet neu erhaltene Karten zum Durchschnittspreis an. **Verändert dein Konto dauerhaft** - standardmäßig aus. |
| **Im Hintergrund farmen** | Aus | Überspringt sekündliche Oberflächen-Neuzeichnungen bei verstecktem Fenster. Die Engine bleibt unberührt. |
| **Errungenschaften beim Stundensammeln freischalten** | Aus | Schaltet während des Farmens in Abständen frei. **Verändert dein Konto dauerhaft.** |
| **Bei Kartendrop benachrichtigen** | Aus | Desktop-Benachrichtigung für jede Karte. |

---

## Markt

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Standard-Verkaufspreis** | Durchschnitt | Startstrategie der Verkaufsleiste: Durchschnitt, Unterbieten, Niedrigsten treffen, Sofort verkaufen oder eigener Preis. |
| **Unterbietungsbetrag** | 1 Cent | Wie weit "Unterbieten" unter das günstigste Angebot geht. Klein schützt den Gewinn, groß verkauft schneller. |
| **Max. Objekte pro Massenverkauf** | 50 | Höhere Werte können bei Steam eine temporäre Sperre auslösen. |
| **Orderbuch-Tiefe** | 5 | Wie viele Preisstufen der Detailbereich zeigt. |
| **Preisaktualisierungsintervall** | 15 Min | Wie oft Preise bei geöffnetem Inventar-Tab neu geholt werden. |
| **Preise automatisch aktualisieren** | Aus | Aktiviert das Intervall oben. |
| **Vor dem Verkauf bestätigen** | An | Zeigt Anzahl, Brutto und Netto vor dem Anbieten. |
| **Zweistufige Bestätigung beim Verkauf** | Aus | Verlangt den Steam-Guard-Mobilcode bei Massenverkäufen. |
| **Preissturz-Warnung** | Aus | Meldet, wenn ein Objekt unter seinen jüngsten Median fällt. |

> **Preise stimmen immer mit Steam überein.** In den Listenspalten gibt es weder
> Währungsumrechnung noch Gebührenabzug. Der angezeigte Betrag ist exakt der Betrag auf der
> Steam-Marktseite. Der Nettobetrag - was nach Steams Abzug in deinem Guthaben landet - wird
> separat im Verkaufsablauf angezeigt.

---

## Inventar

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Standardsortierung** | Nach Wert | Nach welcher Spalte die Tabelle sortiert öffnet. |
| **Doppelklick-Aktion** | Details öffnen | Was ein Doppelklick bewirkt. "Sofort verkaufen" überspringt die Bestätigung - Vorsicht. |
| **Schwelle für geringen Wert** | 1 | Objekte darunter werden abgeblendet, damit sie bei Mehrfachauswahl auffallen. |
| **Nicht verkäufliche Objekte ausblenden** | Aus | Entfernt Gutscheine, Geschenke und nicht tauschbare Objekte. |
| **Verkaufte Objekte ausblenden** | An | Angebotene Objekte wandern zu "Ausstehend", damit du nichts doppelt anbietest. |
| **Nach Spiel gruppieren** | Aus | Öffnet mit aktivierter Gruppierung. |
| **Kompakte Zeilen** | Aus | Zeilenhöhe 60 → 40 Pixel. |

---

## Stunden-Booster

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Standard-Zieldauer** | 1 Stunde | Mit welcher Dauer der Tab öffnet. Unbegrenzt läuft, bis du stoppst. |
| **Max. Spiele gleichzeitig** | 32 | Das bekannte Limit. Darüber zählt Steam keine Zeit. |
| **Startintervall der Spiele** | 5 s | Spiele starten nacheinander in diesem Abstand statt alle gleichzeitig. |
| **Spieleliste merken** | An | Deine Auswahl steht beim nächsten Start bereit. |
| **Nach Ablauf automatisch stoppen** | An | Aus: Spiele bleiben über das Ziel hinaus offen. |
| **Spielreihenfolge mischen** | Aus | Andere Reihenfolge je Sitzung, verteilt die Stunden gleichmäßig. |
| **Farmen beim Boosten pausieren** | Aus | Vermeidet, beide Engines gleichzeitig gegen Steam laufen zu lassen. |

### Stundenabgleich

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Spielzeiten angleichen** | **Aus** | Gleicht die Gesamtspielzeit ausgewählter Spiele stufenweise an. Siehe [Anleitung](./TUTORIAL.md#stundenabgleich). |
| **Ziel** | Höchster der ausgewählten | Oder manuell eingegebene Stunden oder der höchste der gesamten Bibliothek. |
| **Manuelle Zielstunden** | 100 | Nur bei Ziel "Manuell eingegebene Stunden". |

---

## Errungenschaften

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Freischaltintervall** | 1 Sekunde | Wartezeit zwischen zwei Freischaltungen. Die tatsächliche Verzögerung schwankt zufällig darum (±40 %), sodass kein fester Rhythmus entsteht. Längere Optionen reichen bis 90 Minuten. |
| **Standardsortierung** | Standard | Nach Seltenheit stehen die seltensten vorn. |
| **Sicherer Modus** | An | Schaltet einzeln im Intervall frei. Lass ihn an. |
| **Freischaltungen zeitlich verteilen** | Aus | Deutlich größere Streuung - wirkt natürlich, dauert viel länger. |
| **Bei Einzeländerungen bestätigen** | An | Aus: sofort per Doppelklick umschalten. |
| **Ich habe "Nicht mehr fragen" gewählt** | Aus | Erscheint hier, wenn du den Bestätigungsdialog abgeschaltet hast. Ausschalten holt ihn zurück. |

> Errungenschaften freizuschalten verändert dein Steam-Konto dauerhaft. Erneutes Sperren ist
> möglich, das ursprüngliche Freischaltdatum lässt sich aber nicht wiederherstellen.

---

## Benachrichtigungen

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Desktop-Benachrichtigungen anzeigen** | An | Hauptschalter. Aus: nichts darunter erscheint; App-interne Aufzeichnungen laufen weiter. |
| **Kartenfarmen gestartet / gestoppt** | An | Inklusive Kartenanzahl. |
| **Stunden-Boost gestartet / gestoppt** | An | Start, Zielerreichung und Stopp. |
| **Wenn eine Errungenschaft freigeschaltet wird** | An | |
| **Wenn ein Fehler auftritt** | An | Verbindungsabbrüche, abgelehnte Anmeldungen, Verkaufsfehler. Abschalten nicht empfohlen. |
| **Benachrichtigungston** | Klingel | 23 Töne, alle in der App erzeugt - keine Dateien, keine Lizenzfragen. Auswahl spielt ihn ab. |
| **Ruhezeiten** | Aus | Im gewählten Zeitraum keine Benachrichtigungen, auch keine Fehler. |

### Steam-Chat

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Bei neuen Nachrichten benachrichtigen** | An | Freunde, die dir auf Steam schreiben, erreichen dich auch bei Hintergrundbetrieb. |
| **Automatische Antwort senden** | Aus | Antwortet automatisch, wer dir schreibt. |
| **Text der automatischen Antwort** | *(kurze Abwesenheitsnachricht)* | Leer lassen deaktiviert die Funktion. |
| **Wartezeit bis zur erneuten Antwort** | 1 Stunde | Verhindert Spam bei mehreren Nachrichten. |

---

## Datenschutz & Sicherheit

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Offline erscheinen** | Aus | Freunde sehen dich nicht spielen; Aktivität erscheint nicht im Profil. |
| **Spielnamen verbergen** | Aus | Du bist online, welches Spiel läuft, bleibt verborgen. |
| **Sitzungs-Timeout** | Nie | Meldet nach so viel Untätigkeit ab. Laufendes Farmen oder Boosten setzt den Timer zurück. |
| **Zweistufige Bestätigung beim Verkauf** | Aus | Steam-Guard-Code für Massenverkäufe. Schützt dein Inventar bei Kontodiebstahl. |

---

## Statistiken

Gesamtwerte: Laufzeit, erhaltene Karten, verkaufte Karten, Boost-Zeit, bester Tag,
durchschnittlicher Verkauf und Erfassungsbeginn. **Statistiken zurücksetzen** löscht sie.

> XP und Abzeichenzahl werden nicht erfasst - Steam gibt sie für Headless-Zugriff nicht
> heraus. Karten-, Verkaufs- und Zeitwerte sind echte Messungen.

---

## Erweitert & Daten

| Einstellung | Standard | Wirkung |
|---|---|---|
| **Protokollebene** | Nur Fehler | Ausführlich erhöht die Festplattennutzung deutlich. Nur zur Fehlersuche. |
| **Debug-Protokolle behalten** | Aus | Schreibt den gesamten Protokollverkehr nach `cache/steamedge.log`. An Fehlerberichte anhängen. |
| **Hardwarebeschleunigung** | An | Abschalten verkleinert den Grafikprozess und senkte den Speicherbedarf in unseren Messungen um etwa 45 MB, dafuer zeichnet die CPU. Bei Darstellungsfehlern oder Einfrieren ebenfalls ausschalten und neu starten. |
| **Belegter Speicher** | - | Summe aller SteamEdge-Prozesse samt Aufschluesselung. Aus den Prozessmesswerten gelesen, nicht geschaetzt. |
| **API-Anfrageintervall** | 350 ms | Mindestabstand zwischen Steam-Anfragen. Unter 350 ms riskiert ein temporäres Limit. |
| **Datenordner öffnen** | - | Öffnet den Ordner mit `settings/` und `cache/`. |
| **Preis-Cache leeren** | - | Erzwingt das erneute Abrufen aller Preise. |

---

## Kontokarte

Die Leiste rechts in den Einstellungen. Steam-Level, Verbindungsstatus und jedes
Kennungsformat des angemeldeten Kontos: **SteamID** (die 17-stellige), **SteamID2**
(`STEAM_1:...`), **SteamID3** (`[U:1:...]`), **Kontonummer**, **Hex** und die **eigene
Adresse**, falls im Profil gesetzt. Ein Klick auf eine Zeile kopiert den Wert. Alles ausser
der eigenen Adresse wird lokal aus der SteamID berechnet - Steam wird nichts gefragt; die
eigene Adresse stammt von der Profilseite.

**Kennungen kopieren** legt alle auf einmal in die Zwischenablage, **Profil oeffnen**
oeffnet das Profil im Browser.

---

## Aktualisierung

SteamEdge sieht **einmal beim Start** in der Release-Liste nach und zeigt **nur dann** ein
Fenster, wenn eine neuere Version existiert. Bist du aktuell, erscheint gar nichts.

Die Download-Schaltflaeche oben, zwischen Glocke und Zahnrad, wiederholt die Pruefung
jederzeit; dort wird das Ergebnis immer genannt, auch "bereits aktuell".

Die Anwendung liest eine Versionsnummer und sonst nichts. Sie laedt sich nie selbst
herunter, installiert oder ersetzt sich nicht - du entscheidest. Zum Aktualisieren: das
neue Archiv in einen **leeren, neuen Ordner** entpacken und den alten `settings/`-Ordner
daneben kopieren.

---

## Über

Version, Danksagungen und Links zu den Projekten, die SteamEdge inspiriert haben. **Aus
keinem davon wurde Code übernommen** - siehe [README](./README.md#danksagungen).

---

## Empfohlener Einstieg

Wenn es einfach laufen soll, ohne nachzudenken:

- Karten farmen: Modus **Schnell**, max. Spiele **10**
- Errungenschaften: **Sicherer Modus an**, Intervall **1 Sekunde**
- Markt: **Vor dem Verkauf bestätigen an**
- Datenschutz: **Offline erscheinen an**, wenn du Freunde hast, denen es auffällt
- Benachrichtigungen: **Ruhezeiten an** für deine Schlafenszeit

---

Fragen zu Sicherheit, Sperren oder Fehlern: [FAQ](./FAQ.md).
