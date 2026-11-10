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
| E8 | Weichberger hat die Kontoeinstellung „Automatische Bestellung“ (aktuell aus); Seite `/cu/UserSettings`, Schalter ist eine Checkbox, das Formular steht zweimal auf der Seite | phase0-recon.md › Automatisches Bestellen |
| E9 | Warenkorb-Requests beider Shops aufgezeichnet (2026-11-09), Accounts können Warenkorb. Persistenz am Account nicht belegt (Weichberger unbekannt, Göggel wahrscheinlich) | phase0-recon.md › Warenkorb-Request, Warenkorb am Account gespeichert? |
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
- Beide Shops werden parallel durchsucht (E2). Jeder Shop liefert, sobald er fertig ist; seine
  Statuszeile erscheint sofort. Die Reifenliste erscheint in einem Zug, wenn alle gesuchten Shops
  geantwortet haben, spätestens aber 8 s nach der ersten Antwort (2026-11-10; gemessen: Göggel antwortet nach rund
  3,5 s, Weichberger nach rund 9,5 s). So sortiert sich die
  Liste nicht um, während jemand schon darin liest oder Haken setzt.
- **Nur lagernd** (E10): Ein Angebot erscheint nur, wenn der verfügbare Bestand ≥ Stückzahl ist.
  - Weichberger: Mengenfilter des Shops `quantity=<Stückzahl>` (E3).
  - Göggel: Der Adapter setzt „nur verfügbare“ ausdrücklich und prüft den Zustand im Filter-HTML,
    statt sich auf den Standard zu verlassen (E5). Zusätzlich gilt Stückzahl je Zeile ≥ Stückzahl.
- **Günstigste zuerst** (E10): Beide Shops werden nach Netto-EK aufsteigend abgefragt und blättern, bis
  N lagernde Angebote gefunden sind. Die Shop-Reihenfolge ist nicht streng (Göggel: z. B. 41,03 vor
  41,00), deshalb sortiert der Adapter das Ergebnis selbst nach Netto-EK.
- Pro Shop werden höchstens **N** passende Angebote geholt, über so viele Seiten wie nötig.
  N = 40, einstellbar als Function-Secret `MAX_OFFERS_PER_SHOP`. **[Annahme]** (bis 2026-11-10: 20.
  Messung 205/55 R16 ohne Filter: bei 20 je Shop 0 gemeinsame Reifen, bei 40 sind es 5; Weichberger
  braucht dafür rund 9 s statt 7 s.)
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
  gleichzeitig. **[Annahme]** Einmal gelesene EANs merkt sich die App (2026-11-10): Tabelle
  `goeggel_ean` in Supabase (Göggel-Artikelnummer → EAN, nur Service-Role, RLS ohne Policies), lokal
  eine Datei. Die EAN eines Artikels ändert sich nicht, deshalb läuft der Eintrag nicht ab. Gemerkt
  werden nur EANs, keine Preise, Bestände oder Suchergebnisse (Non-Goal 4 bleibt).
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
- Ein Klick „In den Warenkorb“ (im Bereich „Auswahl“, über „Angebot als PDF“) legt die
  ausgewählten Reifen mit ihrer Stückzahl in den Warenkorb des jeweiligen Shops: ein Aufruf des
  Dienstes `cart` je Shop. Die UI zeigt je Reifen „Im Warenkorb“ oder den Fehler. Was schon im
  Warenkorb liegt, wird bei einem weiteren Klick nicht noch einmal abgelegt.
- Göggel kennt beim Ablegen nur eine Zeilennummer der Trefferliste, die nur in der Sitzung gilt,
  die gesucht hat. Der Adapter sucht deshalb die Größe in derselben Sitzung neu, findet die Zeile
  über die Artikelnummer und sendet das Formular der Trefferseite. Danach prüft er auf der
  Warenkorb-Seite, dass die Position mit der Stückzahl dort steht.
- **Gate (Stand 2026-11-09): noch offen.** Der Spike, der belegt, dass der Warenkorb am Account
  gespeichert wird und nicht an der Session hängt (E9, §8), steht aus. Auf Wunsch des Nutzers ist
  die Ablage trotzdem gebaut; den Live-Test (AC18) macht der Nutzer selbst. Hängt der Warenkorb an
  der Sitzung, sieht der Onkel die Positionen nicht, weil die App je Aufruf eine neue Sitzung nutzt.
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
- **Auswahl:** Jede Angebotszeile hat eine Checkbox. Ein gewählter Reifen merkt sich die Stückzahl,
  die beim Anhaken im Filter markiert ist – auch ohne neue Suche (Wunsch 2026-11-07). Spätere
  Filter-Änderungen ändern bereits gewählte Reifen nicht. Die Auswahl bleibt über weitere Suchen
  erhalten (z. B. Mischbereifung vorne/hinten), lebt aber nur im offenen Fenster (kein Speichern,
  damit keine alten Preise liegen bleiben). Die Auswahl hat einen **eigenen Bereich** außerhalb des
  Filters (Wunsch 2026-11-09): am breiten PC (ab 1280 px) eine Spalte am rechten Bildschirmrand
  mit der Liste, „Auswahl aufheben“ und „Angebot als PDF“ unten; die Reifenliste bleibt in der
  Mitte. Auf schmaleren Bildschirmen steht der Bereich zwischen Filter und Reifenliste, und
  die Knöpfe stehen in einer Leiste am unteren Bildschirmrand (AC50). Einzelne Reifen lassen sich entfernen. (Später kommt
  neben „Angebot als PDF“ der Knopf „In den Warenkorb“ dazu.)
- **Angebots-PDF** nach der Excel-Vorlage der Werkstatt („Reifen Angebot_email_2026.xlsx“, Stand Excel,
  ohne Termin und Storno-Hinweis). Es heißt „Reifen-Angebot“ und ist keine Rechnung.
  - Kopfbild der Werkstatt aus der Vorlage, Titel „REIFEN - ANGEBOT“.
  - Kunde, E-Mail, Tel:Nr sind leere, im PDF ausfüllbare Textfelder.
  - Datum (heute, TT.MM.JJJJ) und Dimension (alle gewählten Größen, durch Komma getrennt) sowie
    Stück (die Stückzahl der Zeilen, jede Zahl einmal, z. B. „2“ oder „2, 4“ – keine Summe)
    werden automatisch ausgefüllt.
  - Sommer / Winter / Ganzjahres sind Kästchen, angehakt nach den Saisonen der gewählten Reifen.
  - Je gewähltem Reifen eine Zeile: „Marke Profil“ in Shop-Schreibweise, Dimension mit LI/SI, Stück,
    VK-Preis/Stück = Endkundenpreis aus der App (deckt Montage, Wuchten, Entsorgung ab). Mehr als
    6 Zeilen → die Liste läuft auf weitere Seiten weiter.
  - **Gesamtpreis** = Summe aller Zeilen (Stück × VK-Preis/Stück), damit sofort ein Preis dasteht
    (Wunsch 2026-11-10; vorher galten mehrere Zeilen als Alternativen ohne Summe).
  - Darunter nur zur Information, **nicht** im Gesamtpreis: „zusätzlich“ Räder umstecken PKW bis 17"
    € 34,-; SUV/LLKW/ab 18" € 36,-; einlagern € 32,-; waschen (maschinell) € 15,-; TPMS Diagnose
    € 15,- sowie „*Angebot nur an diesem Tag gültig, da Preisschwankungen bestehen“.
  - Alle vorbefüllten Werte sind ebenfalls Formularfelder und im PDF änderbar. Der Gesamtpreis
    rechnet sich dabei nicht neu.
  - Das PDF entsteht im Browser. Kundendaten werden nicht an einen Server geschickt.
- **PDF-Texte einstellen** (Wunsch 2026-11-07): Knopf „Einstellungen“ rechts oben öffnet ein
  Fenster, in dem jeder Text des Angebots bearbeitbar ist: Titel, Feldbeschriftungen, Saisonen,
  Preisblock, Spaltenköpfe, Gültigkeitshinweis, „zusätzlich“-Zeilen (Text + Preis, hinzufügen und
  entfernen) und „Gesamtpreis“. „Speichern“ legt die Texte **zentral für alle Geräte** ab,
  „Auf Vorlage zurücksetzen“ füllt die Texte der Excel-Vorlage ein. Jedes neue PDF nutzt die
  gespeicherten Texte.
  - Speicher: Function `settings` (GET/PUT, Werkstatt-Code wie bei der Suche). In Supabase eine
    Tabelle `app_settings` (nur Service-Role, RLS ohne Policies); lokal eine Datei.
  - Prüfung: nur Texte (je ≤ 200 Zeichen), höchstens 20 Zusatzzeilen, Anfrage ≤ 32 KB. Fehlende
    Texte werden mit der Vorlage ergänzt. Ist nichts gespeichert, gilt die Vorlage.
  - Zu breite Beschriftungen werden im PDF kleiner gesetzt, damit nichts überlappt.

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
  Angebote des ersten Shops schon sichtbar (bei einem langsamen Shop nach der Wartezeit aus AC48,
  bei einem Fehler sofort). Für den anderen zeigt die UI Laden bzw. die Fehlermeldung.
- AC48 (P2, 2026-11-10) – Solange noch keine Liste zu sehen ist, steht dort „Suche läuft. Die Liste
  erscheint, sobald beide Shops geantwortet haben.“ (bei einem Shop nur „Suche läuft.“). Hat der
  erste Shop geantwortet, wartet die Liste höchstens 8 s auf den zweiten und zeigt dann beide
  zusammen. Antwortet der zweite später, zeigt sie nach den 8 s den ersten Shop und ergänzt den
  zweiten bei dessen Antwort. Auf einen Shop mit Fehler und auf einen nicht gesuchten Shop wird
  nicht gewartet.
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
- AC47 (P2, 2026-11-10) – Haben beide Shops Angebote geliefert und ist kein Reifen in beiden Shops
  dabei, steht über der Liste „Kein Reifen ist in beiden Shops lagernd.“; ohne Marken-Tag zusätzlich
  „Für den direkten Preisvergleich eine Marke wählen.“ Der Hinweis fehlt, solange ein Shop lädt, wenn
  ein Shop nichts oder einen Fehler liefert und wenn nur ein Shop gesucht wurde.
- AC46 (P2, 2026-11-10) – Bekannte Göggel-EANs kommen aus dem EAN-Speicher; der Shop wird nur nach
  den EANs gefragt, die dort fehlen, und diese werden danach gespeichert. Sind alle EANs bekannt,
  geht kein Detail-Request an Göggel. Ist der Speicher nicht lesbar oder nicht schreibbar, liefert
  die Suche trotzdem (EANs dann wie bisher vom Shop). Eine fehlende EAN wird nicht gespeichert.
- AC45 (P2, 2026-11-10) – Jedes Weichberger-Angebot trägt die Saison aus dem Saison-Symbol seiner
  Trefferzeile (`Winter.png`, `Sommer.png`, `Ganzjahres.png`; live geprüft am 2026-11-10). Bei einem
  unbekannten Symbol bleibt die Saison leer. Die Liste zeigt die Saison wie bei Göggel, und das
  Angebots-PDF hakt das passende Saison-Kästchen an.

**Warenkorb**
- AC18 (P3) – Live, mit einem Account mit Warenkorb-Recht: Nach „In den Warenkorb“ sieht der
  Onkel die Positionen mit der gewählten Stückzahl, wenn er sich selbst im Shop anmeldet.
- AC19 (P3) – Ist bei Weichberger „Automatische Bestellung“ aktiv, wird nichts abgelegt, und die UI
  zeigt „Weichberger: Automatische Bestellung ist aktiv – Warenkorb wird nicht befüllt“.
- AC20 (P3) – Kann die Einstellung nicht gelesen werden, wird nichts abgelegt, und die UI zeigt
  „Weichberger: Bestell-Einstellung nicht lesbar – Warenkorb wird nicht befüllt“.
- AC21 (P3) – Ein Aufruf eines Bestell- oder Checkout-Endpunkts über einen Adapter wird abgelehnt,
  ohne dass der Shop kontaktiert wird. Keine Warenkorb-Antwort enthält eine Bestellbestätigung.
  Ebenso abgelehnt: Einstellungen ändern, Warenkorb leeren, Positionen löschen.
- AC44 (P3) – Findet Göggel den Reifen in der neuen Suche nicht mehr, wird nichts abgelegt, und
  die UI zeigt „Göggel: Reifen im Shop nicht mehr gefunden – bitte neu suchen“. Nimmt ein Shop
  den Reifen nicht an, zeigt sie „… Shop hat den Reifen nicht in den Warenkorb übernommen“.

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
- AC42 (P2, Wunsch 2026-11-09) – Oben im Kopf stehen die Logos von Weichberger und Göggel als Links.
  Ein Klick öffnet den jeweiligen Shop (`https://b2b.weichberger.at/`, `https://goeggel-shop.com/`)
  in einem neuen Tab; die App bleibt offen. Die App meldet dabei niemanden an.
- AC43 (P2, Wunsch 2026-11-09, erweitert am selben Tag) – Ist ein Reifen in einem ÖAMTC-Pkw-
  Reifentest seit 2018 getestet (Sommer, Winter, Ganzjahr, All-Terrain; 20 Tests, 488 Ergebnisse)
  und stimmen Marke + Modell und Größe überein, steht das Ergebnis in jeder Angebotszeile dieses
  Reifens (Wunsch 2026-11-10, vorher eine Zeile unter dem Reifennamen): kleines ÖAMTC-Logo, Sterne wie
  bei einer Bewertung (5,5 − Gesamtnote, also 0,5 = 5 Sterne, 5,5 = 0 Sterne, auf ein Zehntel), die
  Gesamtnote in der Farbe ihres Urteils (sehr gut, gut, befriedigend, genügend, nicht genügend) und
  der Test, z. B. „Winter 2026“. Das Ganze ist ein Link auf die ÖAMTC-Seite dieses Reifens, für
  Screenreader „ÖAMTC-Test Winter 2026: Gesamtnote 2,2 (gut)“.
  Wurde er in derselben Größe mehrmals getestet, gilt der neueste Test. Die Zuordnung ist exakt
  (ohne KI; Groß-/Kleinschreibung, Leer- und Sonderzeichen zählen nicht, „Nokian Tyres“ =
  „Nokian“, hochgestellte Ziffern zählen als Ziffern). Abweichende Schreibweisen der Shops
  (z. B. Göggel „HANKOOK K 435 KINERGY eco 2“ = „Hankook Kinergy Eco 2“) stehen in einer von
  Hand geprüften Liste `NAME_VARIANTS`; die Größe muss trotzdem passen. Andere Reifen zeigen nichts. Die Werte stehen nur auf dem Bildschirm, nicht im
  Angebots-PDF, bis ÖAMTC die Nutzung schriftlich erlaubt. Die Daten erzeugt
  `npm run oeamtc:import` aus oeamtc.at; die App selbst ruft ÖAMTC nie auf.
- AC29 (P2, manuell) – Der Filterbereich hat einen eigenen, hellen Hintergrund und ist so klar von der
  weißen Reifenliste getrennt. Am PC (ab 1024 px) ist er fest am linken Bildschirmrand verankert,
  in voller Höhe, und die Reifenliste nutzt die gesamte restliche Breite des Browsers.
- AC30 (P2) – Jedes Angebot trägt genau einen Verfügbarkeits-Tag: „Lagernd“ (grün), wenn die
  Stückzahl sofort verfügbar ist; „2–3 Tage“ (gelb), wenn sie nur mit dem Nebenlager reicht;
  „Nicht lagernd“ (rot) bei Bestand 0.

**Auswahl und Angebots-PDF (3.7)**
- AC31 (P5) – Ein Haken an einer Angebotszeile nimmt den Reifen mit der gerade im Filter markierten
  Stückzahl in die Auswahl (auch ohne neue Suche); spätere Filter-Änderungen ändern ihn nicht. Nach einer neuen Suche ist er weiter ausgewählt. „Auswahl aufheben“ leert sie, ein
  Entfernen-Knopf nimmt einen einzelnen Reifen heraus. Liste, „Auswahl aufheben“ und „Angebot als
  PDF“ stehen in einem eigenen Bereich „Auswahl“ außerhalb des Filters und der Reifenliste (PC ab
  1280 px: Spalte am rechten Rand). Ohne Auswahl zeigt der Bereich nur einen Hinweis (AC49).
- AC50 (P5, 2026-11-10, manuell) – Unter 1280 px stehen „In den Warenkorb“ und „Angebot als PDF“
  nebeneinander in einer Leiste am unteren Bildschirmrand über die ganze Breite (am PC ab 1024 px
  rechts neben dem Filter). Die Leiste verdeckt keine Preise; die Liste hat unten so viel Platz,
  dass auch das letzte Angebot ganz sichtbar ist. Ab 1280 px stehen beide Knöpfe unten in der
  Auswahl-Spalte.
- AC49 (P5, 2026-11-10) – Der Bereich „Auswahl“ ist da, sobald der Werkstatt-Code eingegeben ist.
  Ohne Auswahl steht dort „Noch kein Reifen ausgewählt“ mit einer Zeile Anleitung, ohne Liste und
  ohne Knöpfe. Am PC ab 1280 px ist die Spalte dadurch immer sichtbar, und die Reifenliste ändert
  ihre Breite beim ersten Haken nicht (manuell: Zeilenhöhe bleibt gleich bei 1280, 1366, 1440,
  1536 und 1920 px). Unter 1280 px ist der leere Bereich ausgeblendet.
- AC32 (P5) – Im PDF sind Kunde, E-Mail und Tel:Nr leere Textfelder; Datum ist das heutige Datum;
  Dimension nennt jede gewählte Größe genau einmal; Stück nennt jede Stückzahl der Zeilen genau
  einmal (keine Summe).
- AC33 (P5) – Das PDF hat je gewähltem Reifen eine Zeile mit Bezeichnung, Dimension mit LI/SI, Stück
  und VK-Preis/Stück in der Reihenfolge der Auswahl. Bei mehr als 6 Zeilen hat es mehrere Seiten,
  und keine Zeile fehlt. Die Saison-Kästchen der gewählten Reifen sind angehakt, die anderen nicht.
- AC34 (P5) – Der Gesamtpreis ist die Summe über alle Zeilen von Stück × VK-Preis/Stück, bei einem
  wie bei mehreren Reifen. Das Feld bleibt änderbar. Die Zusatzpreise (umstecken, einlagern, waschen,
  TPMS) gehen nie ein.
- AC35 (P5) – Beim Erstellen des PDFs geht keine Anfrage an die Such-API, und keine Anfrage enthält
  Kundendaten.
- AC36 (P5) – „Einstellungen“ rechts oben öffnet ein Fenster mit allen PDF-Texten, vorbefüllt mit
  den aktuell gespeicherten Texten.
- AC37 (P5) – Nach „Speichern“ nutzt das nächste PDF die neuen Texte, und ein anderes Gerät erhält
  beim Laden dieselben Texte (zentral gespeichert).
- AC38 (P5) – Zusatzzeilen lassen sich hinzufügen und entfernen; leere Zeilen werden nicht
  gespeichert. Sie stehen im PDF nur zur Information und gehen nicht in den Gesamtpreis ein.
- AC39 (P5) – „Auf Vorlage zurücksetzen“ füllt das Fenster mit den Texten der Excel-Vorlage.
- AC40 (P5) – Der Dienst `settings` liefert 401 ohne gültigen Code, 400 bei ungültigen Texten
  (kein Text, > 200 Zeichen, > 20 Zusatzzeilen) und die Vorlage, solange nichts gespeichert ist.

**Meldungen**
- AC41 (P1) – Antwortet Göggel mit der Weiterleitung auf die Login-Seite (abgelaufene Sitzung),
  zeigt die UI „Göggel: Sitzung abgelaufen – bitte erneut suchen“ statt „Shop-Seite hat sich
  geändert“.

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
4. **Phase 3:** Warenkorb. Gebaut am 2026-11-09 nach den Aufzeichnungen des Nutzers (Accounts mit
   Warenkorb-Recht liegen vor). Offen: Live-Test durch den Nutzer und der Spike zur Persistenz am
   Account sowie zum Verhalten bei Parallel-Login.
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

7. N = 40 Angebote pro Shop (seit 2026-11-10, vorher 20).
8. Stückzahl-Tags 1 · 2 · 4 · 6 · 8 (3, 5, 7 nicht wählbar), Standard 4.
9. Größen-Dropdowns als feste Listen (Zoll 13–23 ganzzahlig); welche Marken-Tags ohne „Alle Marken
   anzeigen“ sichtbar sind.
10. EK wird in der UI nicht angezeigt, nur der Endkundenpreis.
11. Göggel-Angebote mit Lieferzeit ungleich „sofort“ ebenfalls gelb markieren?

Technisch, durch Spikes zu klären:

12. ~~Werden Requests aus Supabase-Rechenzentrums-IPs geblockt?~~ Nein: Am 2026-11-10 lieferte eine
    echte Suche über das Projekt in Frankfurt bei beiden Shops 20 Angebote.
13. Bleibt der Warenkorb nach neuem Login erhalten (Weichberger unbekannt, Göggel wahrscheinlich)?
    Beendet ein zweiter Login mit demselben Account die erste Session (z. B. die des Onkels im Browser)?
    (Spike Phase 3)
14. Weichberger-Session-Timeout und ob ~100 Logins pro Tag eine Sperre riskieren.
15. ~~Göggel-Sortierung~~ geklärt: Standard ist „Nettopreis aufsteigend“ (nicht streng); „nur verfügbare“
    ist Standard, heißt aber nicht „lagernd“ (viele Treffer mit Eigenbestand 0, „ca. 3 Tage“). Der Adapter
    filtert deshalb selbst nach Stückzahl.
18. ~~Göggel-EAN dauert~~ gelöst mit dem EAN-Speicher (AC46); die erste Suche nach neuen Artikeln
    dauert weiter so lange. Vorher: Der Shop beantwortet Anfragen einer Sitzung nacheinander (≈ 0,65 s je EAN),
    bei 20 Angeboten ≈ 13 s zusätzlich. Optionen: EAN-Cache (Göggel-Nr → EAN) in Supabase, oder EAN nur
    per Fallback-Schlüssel abgleichen.
19. **Wenig Überschneidung ohne Markenfilter** (gemildert am 2026-11-10: N = 40 und Hinweis AC47): Die je 20 günstigsten lagernden Reifen beider Shops sind
    in der Praxis oft verschiedene Produkte (Test 205/55 R16: 0 gemeinsame Karten; mit BRIDGESTONE 7).
16. Stimmen die Markennamen der beiden Shops überein, oder braucht die Zuordnungstabelle Einträge?
17. Können die Shops mehrere Marken bzw. Saisonen in einer Abfrage filtern? Sonst gilt eine Abfrage
    je Wert. Wie lange dauert das bei Weichberger, z. B. bei 3 Marken?
