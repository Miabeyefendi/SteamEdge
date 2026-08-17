<div align="center">

<img src="../assets/social-preview.jpg" alt="SteamEdge - Steam-Sammelkarten farmen, Spielzeit erhöhen, Erfolge verwalten und auf dem Community Market verkaufen" width="860">

# SteamEdge

**Steam-Sammelkarten farmen, Spielzeit erhöhen, Errungenschaften verwalten und im Community-Markt verkaufen - ohne den Steam-Client zu starten.**

[![Lizenz: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../../LICENSE)
[![Version](https://img.shields.io/github/v/release/Miabeyefendi/steamedge?label=download)](https://github.com/Miabeyefendi/steamedge/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Miabeyefendi/steamedge/total)](https://github.com/Miabeyefendi/steamedge/releases)
[![Plattform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/Miabeyefendi/steamedge/releases/latest)

[English](../../README.md) · [Türkçe](../tr/README.md) · **Deutsch** · [Español](../es/README.md) · [繁體中文](../zh/README.md)

[Download](https://github.com/Miabeyefendi/steamedge/releases/latest) · [Einrichtung](./SETUP.md) · [Anleitung](./TUTORIAL.md) · [Alle Einstellungen](./INSTRUCTIONS.md) · [FAQ](./FAQ.md)

</div>

---

## Was es ist

SteamEdge ist eine Desktop-Anwendung, die über Steams eigenes Netzwerkprotokoll mit Steam
spricht. Sie meldet sich mit deinem Konto an, meldet Spiele als "wird gespielt" und sammelt
die Sammelkarten ein, die Steam dafür ausschüttet. Der Steam-Client muss nie geöffnet sein,
es wird kein Spiel heruntergeladen oder gestartet, und in keinen Prozess wird eingegriffen.

Zusätzlich erhöht sie die Spielzeit, schaltet Errungenschaften frei oder sperrt sie und
liest echte Daten aus dem Community-Markt, damit du deine Karten direkt in der App bepreisen
und verkaufen kannst.

> **Nicht mit der Valve Corporation verbunden.** Steam und das Steam-Logo sind Marken von
> Valve. Nutzung auf eigenes Risiko - siehe [Haftungsausschluss](#haftungsausschluss).

## Funktionen

| | |
|---|---|
| **Karten farmen** | Fünf Modi: nacheinander, meiste Karten, wenigste Karten, eigene Priorität und ein Schnellmodus, der Steams 2-Stunden-Regel berücksichtigt. |
| **Mehrere Konten** | Melde dich bei mehreren Konten gleichzeitig an. Sie farmen parallel im Hintergrund; das Fenster zeigt das Konto, zu dem du wechselst. |
| **Stunden-Booster** | Halte bis zu 32 Spiele gleichzeitig offen. Optionaler **Stundenabgleich** bringt unterschiedliche Spielzeiten stufenweise auf denselben Stand. |
| **Errungenschaften** | Liest den echten Freischaltstatus über das Protokoll, schaltet frei oder sperrt in großen Mengen, mit sicherem Modus und zufälligen Intervallen. |
| **Inventar & Markt** | Echtes Orderbuch (aktuelle Angebote + Kaufaufträge) und echte Verkaufshistorie. Der Wert stammt aus **abgeschlossenen Verkäufen**, nie aus einem einzelnen überhöhten Angebot. |
| **Kein Steam-Client** | Alles läuft über das Steam-Netzwerkprotokoll. Keine Spieldateien, kein Overlay, keine Injektion. |
| **Portabel** | Entpacken und starten. Einstellungen und Cache liegen neben der EXE; in die Registry wird nichts geschrieben. |
| **5 Sprachen** | English, Türkçe, Deutsch, Español, 繁體中文. |

## Schnellstart

1. Lade die neueste `SteamEdge-vX.Y.Z-win-x64.rar` von
   [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest).
2. Entpacke sie an einen Ort, an dem du schreiben darfst (Desktop, USB-Stick, beliebig).
3. Starte `SteamEdge.exe`.
4. Scanne den QR-Code mit der Steam-Mobil-App oder melde dich mit Benutzername und Passwort an.
5. Öffne **Karten farmen** und drücke **Starten**.

Vollständige Anleitung mit Bildern: [Einrichtung](./SETUP.md).

## Im Vergleich

| | SteamEdge | Idle Master | ArchiSteamFarm |
|---|---|---|---|
| Steam-Client nötig | Nein | Ja | Nein |
| Mehrere Konten gleichzeitig | Ja | Nein | Ja |
| Grafische Oberfläche | Ja | Ja | Web-UI |
| Stunden-Boosting | Ja | Nein | Nein |
| Errungenschaftsverwaltung | Ja | Nein | Nein |
| Marktverkauf integriert | Ja | Nein | Nein |
| Portabel (ohne Installation) | Ja | Ja | Ja |

Diese Tabelle betrifft den Umfang, nicht die Qualität. ArchiSteamFarm ist ein deutlich
reiferes Projekt und die bessere Wahl für großflächiges, headless betriebenes Farmen über
viele Konten. SteamEdge richtet sich an einen einzelnen Desktop-Nutzer, der Karten,
Stunden, Errungenschaften und Verkauf in einem Fenster möchte.

## Wie es funktioniert

Steam schüttet Sammelkarten für ein Spiel erst aus, wenn dessen Gesamtspielzeit **2 Stunden**
überschreitet. SteamEdge sendet dieselbe `ClientGamesPlayed`-Nachricht wie der echte
Steam-Client, sodass Steam die Zeit zählt und Karten normal ausschüttet.

- Der **Schnellmodus** bringt zuerst jedes Spiel unter 2 Stunden auf die Schwelle - parallel,
  denn Steam zählt Zeit für jedes gleichzeitig geöffnete Spiel - und hält danach alle offen,
  während das hervorgehobene Spiel alle 1,5-2 Minuten wechselt.
- Der **Gegenstandswert** ist der mengengewichtete Median der *abgeschlossenen Verkäufe* aus
  Steams Preishistorie. Aktuelle Angebote werden getrennt angezeigt und fließen nie in den
  Wert ein, denn ein einzelner Verkäufer, der einen Gegenstand für 999.999 $ anbietet, darf
  ihn nicht verschieben.
- **Preise werden in der Währung deines eigenen Guthabens abgerufen**, aus dem Steam
  Community-Markt gelesen und genau in dieser Währung angezeigt. Es findet nirgends eine
  Umrechnung statt.

## Voraussetzungen

- Windows 10 oder 11, 64-Bit
- Ein Steam-Konto (Steam-Guard-Mobil-Authentifikator empfohlen)
- Eine Internetverbindung

Sonst nichts. Kein .NET, kein Node.js, kein Steam-Client.

## Aus dem Quellcode bauen

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start          # im Entwicklungsmodus starten
npm run build      # portable Version unter ../SteamEdge-vX.Y.Z-win-x64 erzeugen
```

Benötigt Node.js 20 oder neuer. Siehe [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Dokumentation

| Leitfaden | Inhalt |
|---|---|
| [Einrichtung](./SETUP.md) | Download, erster Start, Anmelden, weitere Konten hinzufügen |
| [Anleitung](./TUTORIAL.md) | Erste Karten farmen, Stunden erhöhen, Gegenstand verkaufen |
| [Einstellungen](./INSTRUCTIONS.md) | Jede Einstellung, was sie bewirkt und was du wählen solltest |
| [FAQ](./FAQ.md) | Sperren, Sicherheit, Anfragelimits, Fehlerbehebung |

## Ist es sicher?

Lies [FAQ.md](./FAQ.md), bevor du dich entscheidest. Die Kurzfassung:

- SteamEdge sendet nur Nachrichten, die auch der offizielle Steam-Client sendet. Es
  verändert keine Spieldateien, nutzt keinen Steam-Web-API-Schlüssel und berührt keine
  anderen Spieler.
- Dein Passwort wird nie gespeichert. Steam stellt ein Aktualisierungs-Token aus; dieses
  liegt in `settings/` neben der EXE. Behandle diesen Ordner wie ein Passwort.
- Hunderte Errungenschaften in Sekunden freizuschalten ist auf deinem öffentlichen Profil
  sichtbar. Den sicheren Modus gibt es aus gutem Grund - lass ihn an.
- Dein Konto zu automatisieren verstößt gegen Steams Nutzungsvereinbarung. Niemand kann dir
  garantieren, dass nichts passiert. Dieses Risiko trägst du selbst.

## Mitwirken

Fehlerberichte, Übersetzungen und Pull Requests sind willkommen. Beginne mit
[CONTRIBUTING.md](../../CONTRIBUTING.md) und dem
[Verhaltenskodex](../../CODE_OF_CONDUCT.md). Sicherheitslücken: bitte
[SECURITY.md](../../SECURITY.md) folgen, statt ein öffentliches Issue zu öffnen.

## Danksagungen

SteamEdge ist eine eigenständige, von Grund auf geschriebene Anwendung. Aus den folgenden
Projekten wurde **kein Code übernommen**; jedes wurde untersucht, um zu verstehen, wie Steam
funktioniert, und die gelösten Probleme sowie die gewählten Ansätze haben uns Ideen gegeben.

| Projekt | Was wir daraus gelernt haben | Autor |
|---|---|---|
| [Idle Master](https://github.com/jshackles/idle_master) | Die Grundidee: Karten lassen sich ohne Steam-Client farmen, indem ein Spiel als "wird gespielt" gemeldet wird. | [@jshackles](https://github.com/jshackles) |
| [Idle Master Extended](https://github.com/JonasNilson/idle_master_extended) | Was sich nach der Archivierung des Originals bei Steam geändert hat und welche Einstellungen sinnvoll sind. | [@JonasNilson](https://github.com/JonasNilson) |
| [HourBoostr](https://github.com/ezzpify/HourBoostr) | Dass mehrere Spiele gleichzeitig offen bleiben können und was das für die Spielzeit bedeutet. | [@ezzpify](https://github.com/ezzpify) |
| [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) | Dass Errungenschaften ohne Spielstart gelesen und geändert werden können. | [@gibbed](https://github.com/gibbed) |
| [ArchiSteamFarm](https://github.com/JustArchiNET/ArchiSteamFarm) | Eine langlaufende Headless-Steam-Sitzung stabil halten, maFile-Nutzung und Mehrkontobetrieb. | [@JustArchi](https://github.com/JustArchi) |

Der Teil der App, der mit Steam spricht, nutzt die Open-Source-Pakete
[steam-user](https://github.com/DoctorMcKay/node-steam-user),
[steam-session](https://github.com/DoctorMcKay/node-steam-session),
[steam-totp](https://github.com/DoctorMcKay/node-steam-totp) und
[qrcode](https://github.com/soldair/node-qrcode) von
[@DoctorMcKay](https://github.com/DoctorMcKay) und Mitwirkenden. Der gesamte übrige Code
gehört zu SteamEdge.

## Lizenz

Dieses Projekt steht unter der **GNU Affero General Public License v3.0 (AGPL-3.0)**,
zusammen mit den ergänzenden Bedingungen in der Datei [LICENSE](../../LICENSE). Kurz gesagt:

- Du darfst die Software kostenlos nutzen, untersuchen, verändern, weitergeben und sogar
  damit Geld verdienen, **solange** du den vollständigen Quellcode unter der AGPL-3.0
  verfügbar hältst - auch bei gehosteter/SaaS-/Netzwerknutzung (AGPL Abschnitt 13) - und die
  untenstehende Autorennennung bewahrst.
- Für die Nutzung in einem Closed-Source- oder proprietären Produkt oder als geschlossenes
  SaaS brauchst du eine **separate schriftliche kommerzielle Lizenz** (die eine Lizenzgebühr
  bzw. Umsatzbeteiligung enthalten kann). Siehe [LICENSE](../../LICENSE), Abschnitt 8, und
  kontaktiere mich.

### Autorennennung (erforderlich)

Gemäß AGPL-3.0 Abschnitt 7(b) muss die folgende Nennung in jeder Kopie, jedem Fork und
jeder Bereitstellung sichtbar und unverändert erhalten bleiben:

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

Siehe [NOTICE](../../NOTICE).

## Haftungsausschluss

Diese Software wird "wie besehen" ohne jegliche Gewährleistung bereitgestellt. Du nutzt sie
vollständig auf eigenes Risiko und bist allein für deine Nutzung verantwortlich,
einschließlich der Einhaltung der Steam-Nutzungsvereinbarung. Die Valve Corporation ist mit
diesem Projekt weder verbunden noch unterstützt sie es; Steam und zugehörige Marken gehören
ihren jeweiligen Inhabern. Der Autor übernimmt im gesetzlich größtmöglichen Umfang keine
Haftung für Kontosperren, Datenverlust oder sonstige Schäden. Die vollständigen Bedingungen
stehen in [LICENSE](../../LICENSE).

## Kontakt

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- Für kommerzielle Lizenzierung oder Umsatzbeteiligung erreichst du mich über mein
  GitHub-Profil.

---

<div align="center">
<sub>Entwickelt von <a href="https://github.com/Miabeyefendi">Miabeyefendi</a> · AGPL-3.0-or-later</sub>
</div>
