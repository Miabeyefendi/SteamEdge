# Einrichtung

[English](../en/SETUP.md) · [Türkçe](../tr/SETUP.md) · [Deutsch](../de/SETUP.md) · [Español](../es/SETUP.md) · [繁體中文](../zh/SETUP.md)

SteamEdge zum Laufen zu bringen dauert etwa zwei Minuten. Es gibt kein Installationsprogramm
und es wird nichts in die Windows-Registry geschrieben.

---

## 1. Herunterladen

Gehe zu [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest) und lade
`SteamEdge-vX.Y.Z-win-x64.rar` herunter.

## 2. Entpacken

Rechtsklick auf die ZIP-Datei → **Alle extrahieren**. Lege den Ordner an einen Ort, an dem
du schreiben darfst:

- Gut: `Desktop`, `Dokumente`, `D:\Apps\SteamEdge`, ein USB-Stick
- Vermeiden: `C:\Programme` (Windows blockiert dort das Schreiben, die Einstellungen landen
  dann im AppData-Ordner statt neben der App)

Du erhältst:

```
SteamEdge/
  SteamEdge.exe        die Anwendung
  settings/            beim ersten Start angelegt - Einstellungen, Konten, Sitzung, Statistik
  cache/               beim ersten Start angelegt - Preis-Cache und Protokolldatei
  resources/           app-eigene Dateien, nicht anfassen
  README.txt           kurze Nutzerinformation
```

## 3. Erster Start

Doppelklick auf `SteamEdge.exe`.

Windows SmartScreen zeigt eventuell **"Der Computer wurde durch Windows geschützt"**. Das
liegt daran, dass die EXE nicht signiert ist - ein Signaturzertifikat kostet mehrere hundert
Dollar pro Jahr, was ein kostenloses Hobbyprojekt nicht hat. Klicke auf **Weitere
Informationen → Trotzdem ausführen**.

Wenn du einer Binärdatei von einem Fremden lieber nicht vertraust, ist das eine völlig
berechtigte Haltung: [baue sie stattdessen selbst](#selbst-bauen).

## 4. Anmelden

Du hast zwei Möglichkeiten.

### Variante A - QR-Code (empfohlen)

1. Öffne die **Steam-Mobil-App** auf deinem Handy.
2. Menü → **Steam Guard** → QR-Scanner-Symbol.
3. Scanne den in SteamEdge angezeigten Code.
4. Bestätige die Anmeldung auf dem Handy.

Dein Passwort wird nirgends eingegeben. Das ist die sicherste Variante.

### Variante B - Benutzername und Passwort

1. Gib deinen Steam-Benutzernamen und dein Passwort ein.
2. Gib den Steam-Guard-Code ein, wenn danach gefragt wird (aus der Mobil-App oder per E-Mail).

Dein Passwort wird einmalig verwendet, um ein Token zu erhalten, und **nicht gespeichert**.
Gespeichert wird das von Steam ausgestellte Aktualisierungs-Token in
`settings/session.json`.

> **Schütze den Ordner `settings/`.** Wer ihn kopiert, kann sich als du anmelden. Nicht
> hochladen, nicht in freigegebene Ordner legen, nicht an Fehlerberichte anhängen.

## 5. Optional - Mobil-Authentifikator-Datei (maFile)

Nach der Anmeldung kann SteamEdge eine maFile erzeugen. Damit gibt es Steam-Guard-Codes
automatisch ein, was wichtig ist, wenn Massenverkäufe im Markt ohne einzelne Bestätigung auf
dem Handy durchgehen sollen.

Du kannst das überspringen. Drücke **Überspringen (ohne maFile fortfahren)** - alles außer
der automatischen Bestätigung funktioniert weiterhin.

Wenn du bereits eine maFile aus einem anderen Werkzeug hast, nutze stattdessen **maFile
importieren**.

## 6. Weitere Konten hinzufügen

SteamEdge farmt mehrere Konten gleichzeitig.

1. Klicke oben rechts auf deinen Avatar → **Konto hinzufügen**.
2. Melde dich mit dem zweiten Konto an (QR oder Passwort).
3. Beide Konten farmen nun parallel im Hintergrund.

Über dasselbe Avatar-Menü wechselst du, welches Konto das Fenster anzeigt. Die anderen
laufen weiter, während du eines betrachtest.

## Wo deine Daten liegen

| Pfad | Inhalt | Löschbar? |
|---|---|---|
| `settings/settings.json` | Alle Einstellungen | Ja - setzt auf Standard zurück |
| `settings/session.json` | Dein Anmelde-Token | Ja - du wirst abgemeldet |
| `settings/accounts.json` | Liste gespeicherter Konten | Ja - erneute Anmeldung nötig |
| `settings/stats.json` | Gesamtstatistiken | Ja - nur die Historie geht verloren |
| `settings/state.json` | Warteschlangenreihenfolge, Errungenschaftsprotokoll | Ja |
| `cache/prices.json` | Marktpreis-Cache | Ja - Preise werden neu geholt |
| `cache/steamedge.log` | Diagnoseprotokoll | Ja |
| `cache/chromium/` | Oberflächen-Cache | Ja |

**Sicherung:** Einstellungen → Allgemein → Sicherung → **Exportieren**. Schreibt eine
einzelne `.json` mit deinen Einstellungen und Statistiken. Anmelde-Token und gespeicherte
Konten sind bewusst **nicht** enthalten, die Datei kann also bedenkenlos in der Cloud liegen.

## Auf einen anderen Rechner umziehen

Kopiere den gesamten Ordner. Einstellungen, Konten und Sitzung kommen mit. Steam fragt
eventuell nach einer Bestätigung des neuen Geräts auf deinem Handy.

## Deinstallieren

Ordner löschen. Das ist alles - keine Registry-Schlüssel, keine Restdateien anderswo.

## Selbst bauen

Wenn du keine heruntergeladene Binärdatei ausführen möchtest:

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start
```

Benötigt [Node.js](https://nodejs.org/) 20 oder neuer. Für eine eigene portable Version:

```bash
npm run build
```

Das Ergebnis erscheint in `../SteamEdge-vX.Y.Z-win-x64` neben dem Quellordner.

---

Weiter: [Anleitung](./TUTORIAL.md) - farme deine ersten Karten.
