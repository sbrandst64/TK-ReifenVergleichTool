# Spec: Reifen-Preisvergleich für die Werkstatt

| | |
|---|---|
| Status | v3 freigegeben (2026-11-06), Anpassungen aus dem ersten Build in §3.1, AC6, AC23, §8 |
| Tiefe | Light Spec (Produktentscheidungen, kein Fiskal-/Rechtsbezug) |
| Stand | 2026-11-06 |
| Grundlage | [phase0-recon.md](phase0-recon.md) (Analyse) und Entscheidungen des Nutzers vom 2026-11-06 |

## 1. Problem

Die Werkstatt bestellt Reifen bei zwei B2B-Lieferanten (Weichberger, Göggel). Für jede Anfrage
muss heute in beiden Shops getrennt gesucht und verglichen werden. Gesucht ist eine Seite, die
beide Shops gleichzeitig durchsucht, gleiche Reifen zusammenführt, **pro Reifen** das günstigste
Angebot markiert und ausgewählte Reifen per Klick in den Warenkorb des jeweiligen Shops legt.
Bedient wird oft ohne Tastatur, per Maus oder Smartphone.

## 2. Belege

| ID | Beleg | Quelle |
|---|---|---|
| E1 | Beide Logins sind Formular-POSTs ohne CSRF-Token; Captcha/2FA wurde keins gesehen | phase0-recon.md › Ergebnis pro Shop › Login, Captcha |
| E2 | Beide Suchen funktionieren als reine HTTP-Requests mit Session-Cookie | phase0-recon.md › „Reines HTTP getestet“ |
| E3 | Weichberger-Suche liegt in der Server-Session; mit Mengenfilter ≈ 4–6 s/Seite, ohne ≈ 20–25 s | phase0-recon.md › Suche, Nur lagernd, Dauer |
| E4 | Weichberger liefert EAN in der Liste, Göggel nur per Detail-Request (≈ 0,7 s) | phase0-recon.md › EAN |
| E5 | Weichberger-Treffer kamen im Test nach EK aufsteigend; Göggel-Sortierung und -Filter „nur verfügbare“ laufen über `filtereSuchergebnis` (Richtung bzw. Standardzustand nicht verifiziert) | phase0-recon.md › Sortierung, Nur lagernd, Details für die Adapter |
| E6 | Göggel-Kalkulation des Onkels: Basis Netto-EK, Aufschlag 0 % + 39 €, Rundung 0,10 € auf Brutto-VK; die Formel reproduzierte im Test den angezeigten Göggel-Preis | phase0-recon.md › Entscheidungen |
| E7 | Göggel-Versand PKW: 1 Reifen 6,50 €/Stück, ab 2 Reifen frei Haus | phase0-recon.md › Versandkosten |
| E8 | Weichberger hat die Kontoeinstellung „Automatische Bestellung“ (aktuell aus) | phase0-recon.md › Automatisches Bestellen |
| E9 | Warenkorb-Requests nur aus JS/HTML abgeleitet; Persistenz am Account unbekannt (Weichberger) bzw. wahrscheinlich (Göggel); beide Accounts nur lesend | phase0-recon.md › Warenkorb-Request, Warenkorb am Account gespeichert? |
| E10 | Nutzerentscheidungen: nur lagernd (≥ Stückzahl), günstigste zuerst, Marke nur wenn gesetzt, Endkundenpreis einheitlich EK + 39 € + Versand, Weichberger-Nebenlager gelb, Filter als Tags (Saison/Marke mehrfach, Stückzahl), Größe als Dropdown, Werkstatt-Code, neues Repo | phase0-recon.md › Entscheidungen |
| E12 | Startliste der Marken (20 Hersteller aus dem Weichberger-Filter); Weichberger-Suchformular nimmt eine Marke, Göggel eine Marke als Freitext; Mehrfachfilter der Shops nicht verifiziert | phase0-recon.md › Details für die Adapter |
| E11 | Arbeitsweise laut Auftrag: spec-first, TDD mit anonymisierten Fixtures, Live-Tests opt-in, Quality-Gate vor „fertig“ | Auftrag des Nutzers (Abschnitt „Arbeitsweise“) |

Mit **[Annahme]** markierte Punkte sind Festlegungen dieser Spec ohne Beleg. Sie sind in §8
aufgeführt und gelten, solange niemand widerspricht.

## 3. Scope

### 3.1 Suche (Phase 1 + 2)
- Alle Eingaben sind ohne Tastatur bedienbar (E10):
  - **Größe – Breite, Höhe, Zoll** (Pflicht) als Dropdowns: feste Listen im Frontend; Zoll nur ganze
    Werte 13–23, also keine LKW-Größen. **[Annahme]**
  - **Stückzahl** als Tag-Reihe 1 · 2 · 4 · 6 · 8. Genau ein Tag ist aktiv, Standard 4. **[Annahme]** (Werte)
  - **Saison** als Tags Sommer · Winter · Ganzjahr, mehrere wählbar. Kein Tag aktiv = alle Saisonen.
  - **Marke** als Tags, mehrere wählbar. Kein Tag aktiv = alle Marken. Feste Liste im Frontend
    (Startliste E12) mit Zuordnung je Shop-Schreibweise. Die häufigsten Marken sind sichtbar, der Rest
    hinter „Alle Marken anzeigen“. **[Annahme]** (welche zuerst sichtbar sind)
  - **Anbieter** als Tags Beide · Weichberger · Göggel. Genau ein Tag ist aktiv, Standard Beide. Nur
    die gewählten Shops werden abgefragt (Wunsch 2026-11-06).
  - Tags sind große Tippflächen. Aktiv = blau gefüllt, inaktiv = weiß mit Rahmen (Helligkeitsunterschied,
    nicht nur Farbton). Kein Häkchen, damit sich die Tags beim Antippen nicht verschieben (Wunsch 2026-11-06).
- **Mehrfachauswahl im Adapter:** Kann ein Shop mehrere Werte in einer Abfrage filtern, nutzt der
  Adapter das. Sonst stellt er eine Abfrage je gewähltem Wert und führt die Treffer zusammen.
  Weichberger braucht dafür je Abfrage eine eigene Session, weil die Suche in der Session liegt (E3).
  Danach gilt N für den Shop insgesamt (die N günstigsten über alle Abfragen). Welche Variante ein
  Shop kann, klärt der Spike (§8).
- Beide Shops werden parallel durchsucht (E2). Jeder Shop liefert, sobald er fertig ist.
- **Nur lagernd** (E10): Ein Angebot erscheint nur, wenn der verfügbare Bestand ≥ Stückzahl ist.
  - Weichberger: Mengenfilter des Shops `quantity=<Stückzahl>` (E3).
  - Göggel: Der Adapter setzt „nur verfügbare“ ausdrücklich und prüft den Zustand im Filter-HTML,
    statt sich auf den Standard zu verlassen (E5). Zusätzlich gilt Stückzahl je Zeile ≥ Stückzahl.
- **Günstigste zuerst** (E10): Beide Shops werden nach Netto-EK aufsteigend abgefragt und blättern, bis
  N lagernde Angebote gefunden sind. Die Shop-Reihenfolge ist nicht streng (Göggel: z. B. 41,03 vor
  41,00), deshalb sortiert der Adapter das Ergebnis selbst nach Netto-EK.
- Pro Shop werden höchstens **N** passende Angebote geholt, über so viele Seiten wie nötig.
  N = 20, einstellbar als Function-Secret `MAX_OFFERS_PER_SHOP`. **[Annahme]**
- **Marke** und **Saison** werden nur an die Shops übergeben, wenn mindestens ein Tag aktiv ist (E10).

### 3.2 Preis (Phase 1)
- Endkundenpreis je Stück, für beide Shops gleich (E6, E10):
  `Brutto = rund_0,10((Netto-EK + Versand je Stück + Aufschlag) × (1 + MwSt))`
  - Aufschlag = 39 €, MwSt = 20 %, Rundung auf 0,10 € (E6).
  - Gerechnet wird in ganzen Cent, ohne Gleitkomma. Halbe Stufen runden auf. **[Annahme]** Bei 20 %
    MwSt und Cent-Beträgen tritt eine halbe Stufe nicht auf.
- Versand je Stück aus einer Regel pro Shop, abhängig von der Stückzahl:
  - Göggel: Stückzahl 1 → 6,50 €, ab 2 → 0 € (E7). Behandelt als netto. **[Annahme]**
  - Weichberger: einstellbare Regel „ab X Stück frei, darunter Y € je Stück“. Solange sie nicht
    gesetzt ist, gilt 0 €. Das Angebot zeigt dann „Versand nicht hinterlegt“, und eine
    „günstigstes“-Markierung mit Weichberger-Beteiligung gilt als „vorläufig“.
- Aufschlag, MwSt, Rundung und Versandregeln sind Function-Secrets, nicht fest im Code.
- Die UI zeigt den Endkundenpreis (brutto). Der EK wird nicht angezeigt. **[Annahme]**

### 3.3 Zusammenführen (Phase 2)
- Einheitliches Format `TireOffer` je Angebot: Shop, Shop-Artikel-ID, EAN (falls bekannt), Marke,
  Profil, Breite, Höhe, Zoll, LI, SI, Bezeichnung, Bestand gesamt, Lieferhinweis (sofort / 2–3 Tage),
  Endkundenpreis, Versandhinweis.
- **Marke** kommt in beiden Shops aus dem Feld „Hersteller“ (phase0-recon.md › Details für die
  Adapter), nicht aus dem Kürzel in der Bezeichnung.
- Gleiche Reifen werden zu einer Gruppe zusammengefasst:
  1. Gleiche EAN → gleiche Gruppe.
  2. Sonst gleicher Schlüssel aus Marke + Profil + Breite/Höhe/Zoll + LI + SI, normalisiert
     (Großbuchstaben, ohne Leer- und Sonderzeichen, Marken über eine feste Zuordnungstabelle).
  3. Wenn weder EAN noch Schlüssel passen, bleibt das Angebot eine eigene Gruppe. Lieber nicht
     zusammenführen als falsch zusammenführen.
- Göggel-EANs werden per Detail-Request nur für die angezeigten Angebote geholt (E4), höchstens 4
  gleichzeitig. **[Annahme]**
- In jeder Gruppe ist das Angebot mit dem niedrigsten Endkundenpreis als **günstigstes** markiert,
  bei Gleichstand alle gleich günstigen.
- Gruppen sind nach ihrem günstigsten Endkundenpreis aufsteigend sortiert. Jedes Angebot zeigt
  seinen Shop.
- **Gelb** markiert ist ein Weichberger-Angebot, das die Stückzahl nur zusammen mit dem Nebenlager
  (2–3 Tage) erreicht (E10). Für Göggel ist offen, ob auch eine Lieferzeit ungleich „sofort“ gelb
  wird (§8).
- **Verfügbarkeits-Tag** an jedem Angebot (Wunsch 2026-11-06): grün „Lagernd“ (Stückzahl sofort da),
  gelb „2–3 Tage“ (nur mit Nebenlager, siehe oben), rot „Nicht lagernd“ (kein Bestand). Da weiterhin
  nur lagernde Angebote angezeigt werden, kommt Rot derzeit nicht vor; der Tag ist vorbereitet.
- Gibt es keine Treffer, zeigt die UI „Keine lagernden Reifen in dieser Größe“ pro Shop.

### 3.4 Auswahl und Warenkorb (Phase 3)
- Angebote lassen sich per Checkbox auswählen (siehe 3.7). Die Auswahl ist pro Shop gruppiert.
- Ein Klick „In den Warenkorb legen“ legt die ausgewählten Positionen in den Warenkorb des
  jeweiligen Shops. Die UI zeigt je Position Erfolg oder einen Fehler.
- **Gate:** Phase 3 startet erst nach einem Spike, der belegt, dass der Warenkorb am Account
  gespeichert wird und nicht an der Session hängt (E9, §8). Sonst funktioniert „eine Session pro
  Anfrage“ nicht.
- Weichberger: Vor dem Ablegen liest der Adapter die Einstellung „Automatische Bestellung“ (E8).
  - aktiv → nichts ablegen, Fehler `AUTO_ORDER_ENABLED`
  - nicht lesbar oder nicht eindeutig → nichts ablegen, Fehler `AUTO_ORDER_UNKNOWN` (fail closed)
- Die Adapter dürfen nur Endpunkte einer festen Freigabeliste aufrufen: Login, Suche, Detail,
  Warenkorb-Ablage, Warenkorb-Anzeige, Konto-Einstellungen lesen. Jeder andere Endpunkt,
  insbesondere Bestellen und Checkout, wird vor dem Senden abgelehnt.

### 3.5 Fehler und Health-Check (Phase 1 Adapter, Phase 4 UI)
- Jeder Adapter-Aufruf liefert entweder Ergebnisse oder einen festen Fehlercode:
  `LOGIN_FAILED`, `SESSION_EXPIRED`, `LAYOUT_CHANGED` (Pflichtfeld fehlt oder Plausibilitätsprüfung
  schlägt fehl), `TIMEOUT` (> 60 s **[Annahme]**, unter dem Wall-Clock-Limit der Edge Functions),
  `BLOCKED` (HTTP 403/429), `UPSTREAM_ERROR` (sonstiger HTTP-Fehler), `AUTO_ORDER_ENABLED`,
  `AUTO_ORDER_UNKNOWN`.
- Die UI zeigt pro Shop eine verständliche Meldung. Der andere Shop wird weiter angezeigt.
- Live-Smoke-Test (opt-in, `LIVE=1`): Login und Testsuche je Shop (E11).

### 3.6 Querschnitt
- **Zugriff:** gemeinsamer Werkstatt-Code (E10). Die UI fragt ihn einmal ab und merkt ihn sich
  lokal. Jede Function prüft ihn gegen ein Secret. Ein falscher Code ergibt 401, und die UI fragt neu.
- **Zugangsdaten** nur als Supabase-Secrets bzw. lokal in `supabase/functions/.env` (git-ignoriert).
  Sie werden nie geloggt und nie an das Frontend geliefert.
- **Eine Session pro Anfrage:** Jede Suche meldet sich neu an (E3), damit sich parallele Suchen nicht
  stören. Für den Warenkorb gilt das nur, wenn das Gate aus 3.4 erfüllt ist.
- **CORS** nur für die GitHub-Pages-Origin und localhost.
- **Fixtures und Testdaten** sind anonymisiert bzw. synthetisch: keine Kundennummern, Session-IDs,
  Namen oder echten EK. Das Repo kann öffentlich sein (GitHub Pages).

### 3.7 Auswahl und Angebots-PDF (Phase 5, Wunsch 2026-11-06)
- **Auswahl:** Jede Angebotszeile hat eine Checkbox. Ein gewählter Reifen merkt sich die Stückzahl
  der Suche, in der er angehakt wurde (nicht änderbar). Die Auswahl bleibt über weitere Suchen
  erhalten (z. B. Mischbereifung vorne/hinten), lebt aber nur im offenen Fenster (kein Speichern,
  damit keine alten Preise liegen bleiben). Eine Leiste zeigt die Auswahl, lässt einzelne Reifen
  entfernen und bietet „Angebot als PDF“ und „Auswahl aufheben“.
- **Angebots-PDF** nach der Excel-Vorlage der Werkstatt („Reifen Angebot_email_2026.xlsx“, Stand Excel,
  ohne Termin und Storno-Hinweis). Es heißt „Reifen-Angebot“ und ist keine Rechnung.
  - Kopfbild der Werkstatt aus der Vorlage, Titel „REIFEN - ANGEBOT“.
  - Kunde, E-Mail, Tel:Nr sind leere, im PDF ausfüllbare Textfelder.
  - Datum (heute, TT.MM.JJJJ) und Dimension (alle gewählten Größen, durch Komma getrennt) sowie
    Stück (Summe aller Zeilen) werden automatisch ausgefüllt.
  - Sommer / Winter / Ganzjahres sind Kästchen, angehakt nach den Saisonen der gewählten Reifen.
  - Je gewähltem Reifen eine Zeile: „Marke Profil“ in Shop-Schreibweise, Dimension mit LI/SI, Stück,
    VK-Preis/Stück = Endkundenpreis aus der App (deckt Montage, Wuchten, Entsorgung ab). Mehr als
    6 Zeilen → die Liste läuft auf weitere Seiten weiter.
  - **Gesamtpreis** = Summe aller Zeilen (Stück × VK-Preis/Stück).
  - Darunter nur zur Information, **nicht** im Gesamtpreis: „zusätzlich“ Räder umstecken PKW bis 17"
    € 34,-; SUV/LLKW/ab 18" € 36,-; einlagern € 32,-; waschen (maschinell) € 15,-; TPMS Diagnose
    € 15,- sowie „*Angebot nur an diesem Tag gültig, da Preisschwankungen bestehen“.
  - Alle vorbefüllten Werte sind ebenfalls Formularfelder und im PDF änderbar. Der Gesamtpreis
    rechnet sich dabei nicht neu.
  - Das PDF entsteht im Browser. Kundendaten werden nicht an einen Server geschickt.

## 4. Non-Goals

1. Rechnungen (Rechnungsnummer, UID usw.). Das PDF ist ein Angebot.
2. Bestellen oder Checkout, in keiner Form, auch nicht teilautomatisiert.
3. KI/LLM zur Laufzeit: Selektoren, Requests und Matching sind fest programmiert.
4. Kein Preis-Crawler, keine Preis-Historie, kein Vorab-Cache von Suchergebnissen.
5. Weitere Lieferanten, LKW-Reifen (u. a. 17,5″/19,5″/22,5″), Motorrad- und Landwirtschaftsreifen,
   Felgen, Zubehör.
6. Benutzerkonten pro Person, Rollen, Audit-Log.
7. Shop-Einstellungen ändern, z. B. „Automatische Bestellung“ abschalten. Sie werden nur gelesen.
8. Weitere Filter: EU-Label, RunFlat, XL, LI/SI-Filter.

## 5. Akzeptanzkriterien (beobachtbar)

In Klammern steht die Phase. „Fixture-Daten“ heißt: anonymisierte, aufgezeichnete Shop-Antworten.
„Live“ heißt: echter Shop, nur mit `LIVE=1`.

**Suche**
- AC1 (P2) – Gegeben die Fixture-Daten beider Shops für eine Größe und Stückzahl 4: Die Liste zeigt
  Angebote aus beiden Shops, jedes mit seinem Shop beschriftet.
- AC2 (P1) – Jedes angezeigte Angebot hat einen Bestand ≥ der gewählten Stückzahl. Fixture-Zeilen
  mit weniger Bestand erscheinen nicht.
- AC3 (P1) – Ohne aktiven Marken-Tag sendet der Adapter keinen Markenfilter an den Shop. Sind die
  Tags MICHELIN und CONTINENTAL aktiv, enthält die Liste nur Angebote dieser beiden Marken, aus
  beiden Shops.
- AC3a (P1) – Sind die Saison-Tags Sommer und Ganzjahr aktiv, enthält die Liste keine Winterreifen.
  Ohne aktiven Saison-Tag gibt es keine Saison-Einschränkung.
- AC4 (P2) – Liefert ein Shop sofort und der andere erst nach 20 s oder mit Fehler, sind die
  Angebote des ersten Shops schon sichtbar. Für den anderen zeigt die UI Laden bzw. die Fehlermeldung.
- AC5 (P2) – Größe (Dropdowns) sowie Stückzahl, Saison und Marke (Tags) sind ohne Tastatur
  bedienbar und auf 375 px Breite ohne horizontales Scrollen nutzbar.
- AC5a (P2) – Ein Tipp auf einen Saison- oder Marken-Tag schaltet ihn an oder aus, und der Zustand ist
  auch ohne Farbe erkennbar. Ein Tipp auf einen Stückzahl-Tag aktiviert ihn und deaktiviert den
  vorherigen.
- AC6 (P1) – Pro Shop kommen höchstens N Angebote, nach Netto-EK aufsteigend sortiert. Stehen in den Fixture-Daten mehr als N passende Angebote, werden nur die N günstigsten geliefert.
- AC7 (P2) – Gibt es für eine Größe keine lagernden Angebote, zeigt die UI pro Shop „Keine lagernden
  Reifen in dieser Größe“.

**Preis** (synthetische Werte, Aufschlag 39 €, MwSt 20 %)
- AC8 (P1) – Göggel-Angebot, Netto-EK 50,14 €, Stückzahl 4 → (50,14 + 0 + 39) × 1,2 = 106,968 → **107,00 €**.
- AC9 (P1) – Dasselbe mit Stückzahl 1 → (50,14 + 6,50 + 39) × 1,2 = 114,768 → **114,80 €**.
- AC10 (P1) – Weichberger-Regel „ab 4 frei, darunter 5,00 €“, Netto-EK 50,14 €: Bei Stückzahl 2 ergibt
  sich (50,14 + 5,00 + 39) × 1,2 = 112,968 → **113,00 €**, bei Stückzahl 4 → 107,00 €.
- AC11 (P1) – Ist die Weichberger-Versandregel nicht gesetzt, tragen Weichberger-Angebote „Versand
  nicht hinterlegt“, und eine „günstigstes“-Markierung mit Weichberger-Beteiligung ist als „vorläufig“ gekennzeichnet.
- AC12 (P1) – Wird der Aufschlag als Secret geändert, ändert sich der Preis der nächsten Suche ohne
  neues Deployment.

**Zusammenführen**
- AC13 (P2) – Zwei Angebote mit gleicher EAN aus beiden Shops stehen als eine Gruppe. Das günstigere
  ist markiert.
- AC14 (P2) – Ohne EAN, aber mit gleicher Marke, gleichem Profil, gleicher Dimension und gleichem
  LI/SI stehen zwei Angebote in einer Gruppe.
- AC15 (P2) – Angebote mit unterschiedlichem LI oder SI stehen nie in derselben Gruppe.
- AC16 (P2) – Ein Weichberger-Angebot, dessen Bestand in Filiale + Zentrallager unter der Stückzahl
  liegt und erst mit dem Nebenlager reicht, ist gelb markiert (gelber Tag „2–3 Tage“, siehe AC30).
- AC17 (P2) – Gruppen sind nach ihrem günstigsten Endkundenpreis aufsteigend sortiert.

**Warenkorb**
- AC18 (P3) – Live, mit einem Account mit Warenkorb-Recht: Nach „In den Warenkorb legen“ sieht der
  Onkel die Positionen mit der gewählten Stückzahl, wenn er sich selbst im Shop anmeldet.
- AC19 (P3) – Ist bei Weichberger „Automatische Bestellung“ aktiv, wird nichts abgelegt, und die UI
  zeigt „Weichberger: Automatische Bestellung ist aktiv – Warenkorb wird nicht befüllt“.
- AC20 (P3) – Kann die Einstellung nicht gelesen werden, wird nichts abgelegt, und die UI zeigt
  „Weichberger: Bestell-Einstellung nicht lesbar – Warenkorb wird nicht befüllt“.
- AC21 (P3) – Ein Aufruf eines Bestell- oder Checkout-Endpunkts über einen Adapter wird abgelehnt,
  ohne dass der Shop kontaktiert wird. Keine Warenkorb-Antwort enthält eine Bestellbestätigung.

**Fehler / Sicherheit**
- AC22 (P1/P4) – Bei falschen Shop-Zugangsdaten zeigt die UI für diesen Shop „Anmeldung
  fehlgeschlagen – Zugangsdaten prüfen“. Der andere Shop funktioniert weiter.
- AC23 (P1/P4) – Fehlt im Shop-HTML ein Pflichtfeld, zeigt die
  UI „Shop-Seite hat sich geändert – Adapter prüfen“ statt Preisen dieses Shops.
- AC24 (P1/P4) – Antwortet ein Shop länger als 60 s nicht, zeigt die UI „Shop antwortet nicht“. Bei
  HTTP 403/429 zeigt sie „Shop blockiert Anfragen“. Bei abgelaufener Session zeigt sie „Sitzung
  abgelaufen – bitte erneut suchen“.
- AC25 (P1) – Ein Aufruf ohne oder mit falschem Werkstatt-Code liefert 401 und keine Daten.
- AC26 (P1) – Weder das Frontend-Bundle noch eine Function-Antwort noch ein Log enthält
  Shop-Zugangsdaten.
- AC27 (P2) – Ist im Anbieter-Filter „Weichberger“ aktiv, wird nur Weichberger abgefragt. Für Göggel
  erscheinen weder Statuszeile noch Angebote, und die Zusammenfassung nennt „Weichberger“. Mit
  „Göggel“ gilt das umgekehrt. Standard ist „Beide“.
- AC28 (P2) – Jede Angebotszeile zeigt das Logo ihres Shops mit dem Shopnamen als Alternativtext,
  auf einem Schild in der Shopfarbe (Weichberger weiß/dunkelblau, Göggel dunkel).
- AC29 (P2, manuell) – Der Filterbereich hat einen eigenen, hellen Hintergrund und ist so klar von der
  weißen Reifenliste getrennt. Am PC (ab 1024 px) ist er fest am linken Bildschirmrand verankert,
  in voller Höhe, und die Reifenliste nutzt die gesamte restliche Breite des Browsers.
- AC30 (P2) – Jedes Angebot trägt genau einen Verfügbarkeits-Tag: „Lagernd“ (grün), wenn die
  Stückzahl sofort verfügbar ist; „2–3 Tage“ (gelb), wenn sie nur mit dem Nebenlager reicht;
  „Nicht lagernd“ (rot) bei Bestand 0.

**Auswahl und Angebots-PDF (3.7)**
- AC31 (P5) – Ein Haken an einer Angebotszeile nimmt den Reifen mit der Stückzahl seiner Suche in die
  Auswahl. Nach einer neuen Suche ist er weiter ausgewählt. „Auswahl aufheben“ leert sie, ein
  Entfernen-Knopf nimmt einen einzelnen Reifen heraus.
- AC32 (P5) – Im PDF sind Kunde, E-Mail und Tel:Nr leere Textfelder; Datum ist das heutige Datum;
  Dimension nennt jede gewählte Größe genau einmal; Stück ist die Summe aller Zeilen.
- AC33 (P5) – Das PDF hat je gewähltem Reifen eine Zeile mit Bezeichnung, Dimension mit LI/SI, Stück
  und VK-Preis/Stück in der Reihenfolge der Auswahl. Bei mehr als 6 Zeilen hat es mehrere Seiten,
  und keine Zeile fehlt. Die Saison-Kästchen der gewählten Reifen sind angehakt, die anderen nicht.
- AC34 (P5) – Der Gesamtpreis ist die Summe aus Stück × VK-Preis/Stück aller Zeilen. Die Zusatzpreise
  (umstecken, einlagern, waschen, TPMS) gehen nicht ein.
- AC35 (P5) – Beim Erstellen des PDFs geht keine Anfrage an die Such-API.

## 6. Architektur (Kurzfassung)

- **Frontend:** Vite + React + TypeScript, statisch auf GitHub Pages.
- **Backend:** Supabase Edge Functions (Deno/TS): `search` (Parameter `shop`), `cart` (Phase 3).
- **Adapter** `weichberger`, `goeggel` mit `search(query) → TireOffer[]` und
  `addToCart(items) → Result[]`, plus Endpunkt-Freigabeliste. Das HTML wird mit deno-dom und festen
  Selektoren ausgelesen.
- **Reine Module:** Preisberechnung (Cent-Arithmetik), Versandregeln, Matching. Sie werden geteilt
  und sind ohne Netzwerk testbar.
- **Tests** (E11): `deno test` (Adapter, Parser, Preis, Matching) mit anonymisierten Fixtures;
  Vitest für die UI-Logik; Live-Tests nur mit `LIVE=1`; ≥ 80 % Coverage laut `tdd-workflow`;
  `/efsta-core:quality-gate` vor „fertig“.

## 7. Rollout

1. **Spike (Beginn Phase 1):** eine minimale Function aus Supabase meldet sich bei beiden Shops an
   und sucht einmal. Damit ist geprüft, dass Rechenzentrums-IPs nicht geblockt werden. Bei einer
   Sperre wird pausiert und neu entschieden.
2. **Phase 1:** Adapter `search` + Parser + Preis + Fehlercodes, testgetrieben mit Fixtures.
3. **Phase 2:** UI + Matching, Deployment auf GitHub Pages.
4. **Phase 3:** Warenkorb. **Blockiert**, bis pro Shop ein Login mit Warenkorb-Recht vorliegt.
   Danach zuerst ein Spike: Ablage, Persistenz am Account, Verhalten bei Parallel-Login (Göggel vorab
   im Demo-Shop). Erst dann folgt die Umsetzung.
5. **Phase 4:** Fehlermeldungen in der UI, Live-Smoke-Test, Quality-Gate.

## 8. Offene Fragen

Klärung durch den Nutzer bzw. Onkel:
1. **Versand Weichberger:** Ab wie vielen Reifen frei, was kostet es darunter? (Onkel: „ab 4 frei“?)
2. **Versand Göggel:** Gilt „ab 2 Reifen frei Haus“ auch nach Österreich? Sind die 6,50 € netto?
3. **Accounts mit Warenkorb-Recht** für beide Shops, idealerweise „Warenkorb ja, Bestellen nein“.
   Blockiert Phase 3.
4. **Supabase-Projekt:** das bestehende Werkstatt-Projekt mitnutzen oder ein neues anlegen?
5. **Lieferanten-Schnittstelle:** Gibt es eine API oder CSV-Preisliste (Frage an den Außendienst)?
   Falls ja, könnte sie einen Adapter ersetzen.
6. **Nutzung:** Angenommen sind < 10 Nutzer und < 100 Suchen pro Tag. Daraus folgt: kein Cache,
   Login pro Suche ist vertretbar.

Bitte bestätigen oder ändern (**[Annahme]**-Punkte):

7. N = 20 Angebote pro Shop.
8. Stückzahl-Tags 1 · 2 · 4 · 6 · 8 (3, 5, 7 nicht wählbar), Standard 4.
9. Größen-Dropdowns als feste Listen (Zoll 13–23 ganzzahlig); welche Marken-Tags ohne „Alle Marken
   anzeigen“ sichtbar sind.
10. EK wird in der UI nicht angezeigt, nur der Endkundenpreis.
11. Göggel-Angebote mit Lieferzeit ungleich „sofort“ ebenfalls gelb markieren?

Technisch, durch Spikes zu klären:

12. Werden Requests aus Supabase-Rechenzentrums-IPs geblockt? (Spike Phase 1)
13. Bleibt der Warenkorb nach neuem Login erhalten (Weichberger unbekannt, Göggel wahrscheinlich)?
    Beendet ein zweiter Login mit demselben Account die erste Session (z. B. die des Onkels im Browser)?
    (Spike Phase 3)
14. Weichberger-Session-Timeout und ob ~100 Logins pro Tag eine Sperre riskieren.
15. ~~Göggel-Sortierung~~ geklärt: Standard ist „Nettopreis aufsteigend“ (nicht streng); „nur verfügbare“
    ist Standard, heißt aber nicht „lagernd“ (viele Treffer mit Eigenbestand 0, „ca. 3 Tage“). Der Adapter
    filtert deshalb selbst nach Stückzahl.
18. **Göggel-EAN dauert:** Der Shop beantwortet Anfragen einer Sitzung nacheinander (≈ 0,65 s je EAN),
    bei 20 Angeboten ≈ 13 s zusätzlich. Optionen: EAN-Cache (Göggel-Nr → EAN) in Supabase, oder EAN nur
    per Fallback-Schlüssel abgleichen.
19. **Wenig Überschneidung ohne Markenfilter:** Die je 20 günstigsten lagernden Reifen beider Shops sind
    in der Praxis oft verschiedene Produkte (Test 205/55 R16: 0 gemeinsame Karten; mit BRIDGESTONE 7).
16. Stimmen die Markennamen der beiden Shops überein, oder braucht die Zuordnungstabelle Einträge?
17. Können die Shops mehrere Marken bzw. Saisonen in einer Abfrage filtern? Sonst gilt eine Abfrage
    je Wert. Wie lange dauert das bei Weichberger, z. B. bei 3 Marken?
