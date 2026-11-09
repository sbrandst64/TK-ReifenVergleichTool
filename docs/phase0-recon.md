# Phase 0 – Analyse der Lieferanten-Shops

Stand: 2026-11-06. Grundlage: HAR-Mitschnitte (Login durch den Nutzer), danach lesende Suchen
mit gespeicherter Session (Browser und reines HTTP). Rohdaten liegen in `recon/` (git-ignoriert,
enthält Zugangsdaten und Kundendaten). In diesem Dokument stehen bewusst keine Kundennummern,
Session-IDs oder konkreten Einkaufspreise.

Testsuche überall: 205/55 R16.

## Ergebnis pro Shop

| | Weichberger (b2b.weichberger.at) | Göggel (goeggel-shop.com) |
|---|---|---|
| Technik | ASP.NET MVC, serverseitiges HTML, jQuery | PHP, jQuery-AJAX, Antworten als JSON mit HTML-Fragment |
| Login | Formular-POST `/100/Account/Login` (`UserName`, `Password`, `RememberMe`), kein CSRF-Token, 302 auf `/115/…` | Formular-POST `/login.php?…&sess-shop=<id>` (`s`, `id`, `pw`, `send`), kein CSRF-Token, 302 auf `/search.php` |
| Captcha / 2FA | keins gesehen | keins gesehen |
| Session | Cookies `ASP.NET_SessionId` + `.ASPXAUTH` (Browser-Session, serverseitiges Timeout unbekannt) | Cookie `sess-shop`, Max-Age 8 h |
| Suche | **zustandsbehaftet** (Parameter liegen in der Server-Session): `POST /115/Items/TyreSearch` → `POST /115/Items/SearchResult/{catId}` (Filter, Sortierung, `page`, `quantity`) → `GET /115/Items/SearchResult` (HTML) | `POST /includes/php_ajax/ajax_search.php` `func=holeSuchergebnis&suchart=bqz&breite&querschnitt&zoll&saison&hersteller` → JSON `{filter, ergtab}`; Filter/Sortierung/Blättern danach per `func=filtereSuchergebnis&filterart=…&filterwert=…` (in der Session) |
| Nur lagernd | Mengenfilter `quantity=<n>` (Cookie `FilterByAmount`): nur Artikel mit ≥ n Stück Bestand (Filiale + Zentrallager + Nebenlager) | Filter „nur verfügbare Artikel“ (`filterart=nurvfg`) ist offenbar **standardmäßig aktiv**: 565 Treffer mit, 1049 nach dem Umschalten. Stückzahl pro Zeile vorhanden |
| Sortierung | Standard bereits EK aufsteigend | Nettopreis, EVB-Preis, Bestand u. a. (auf-/absteigend) |
| Dauer | ohne Mengenfilter ≈ 20–25 s **pro Seite**; **mit Mengenfilter ≈ 4–6 s** | ≈ 3 s pro Request |
| Treffermenge (Test) | ohne Filter 25 Seiten à 15; mit `quantity=4` 4 Seiten à 15 | 565 Treffer, 20 pro Seite (ohne Lagerfilter) |
| EAN | in der Trefferliste | **nicht in der Liste**; in der Detailansicht `POST ajax_global.php` `func=ladeBildanzeige&int=<Göggel-Nr>` (≈ 0,7 s/Artikel) |
| Weitere Felder | Bezeichnung (Marke-Kürzel, Dimension, Profil, LI/SI, TL), Hersteller, Art.-Nr., EU-Label, Bestand Filiale / Zentrallager / Nebenlager (2–3 Tage), Netto-EK, **EVP exkl./inkl.** | Dimension+SI+TL, LI/SI, Hersteller, Profil, Saison, EU-Label, Verfügbarkeit (Ampel, Lieferzeit, Stück), EK-Preis, Ertrag, **VK o./m. MwSt**, KB-Preis; Detail: EAN, Hersteller-Art.-Nr. |
| Endkundenpreis | EVP = Preisempfehlung von Weichberger | VK = vermutlich aus der eigenen „Kalkulation“ im Göggel-Konto (VK − EK = „Ertrag“); zusätzlich Sortierung nach „EVB-Preis“. **Zu klären** |
| Versandkosten | Nicht im Shop angegeben. AGB: Transport trägt der Käufer, außer freie Zustellung ist schriftlich vereinbart → **individuelle Vereinbarung, zu klären** | Laut „Lieferbedingungen“ im Shop: PKW-Reifen Einzelstück 6,50 €/Reifen, **ab 2 Reifen frei Haus**. Ob das auch für Lieferungen nach Österreich gilt: zu klären |
| Warenkorb-Request | **Aufgezeichnet 2026-11-09** (HAR in `recon/`, Account kann Warenkorb): `POST /100/b/JsonInsertIntoBasket`, Formular `itemID=<Art.-ID>&quantity=<Stk>&imagepath&description&info` → JSON `{"success":true,"UserNotification":{"Title":"Artikel eingefügt",…}}`. `itemID` = unsere `shopArticleId` (gleiches Formularfeld der Trefferliste). Im Test war `quantity` leer (Feld nicht ausgefüllt) → Stückzahl-Feld muss gesetzt werden. Danach `GET /100/b/RefreshBasket` (nur Kopfzeile) | **Aufgezeichnet 2026-11-09**: Formular-POST `scart.php?site=write&s=1&sess-shop=<id>` mit **allen** 20 Zeilen der aktuellen Trefferseite (`anz<i>`=Stück oder leer, `key<i>`) plus `vkpreis=vkpreis_opt&opt7=` → 302 auf `scart.php?site=show` (Warenkorbseite mit Positionen, Summe netto). **`key<i>` ist nicht die Göggel-Nr.** (`data-int`), sondern eine kleine Zeilennummer der Trefferliste in derselben Sitzung (z. B. 919) → der Adapter muss erst suchen und den `key` aus der Zeile mit der passenden `data-int` lesen |
| Warenkorb am Account gespeichert? | unbekannt (Ab-/Anmelde-Test steht aus) | wahrscheinlich ja (Warenkorb-Popup nach Login aktualisiert alte Positionen). Ab-/Anmelde-Test steht aus |
| Automatisches Bestellen | Kontoeinstellung „Automatische Bestellung“ mit Bestellzeiten pro Wochentag existiert. **Aktuell aus**, keine Zeiten hinterlegt | nichts gefunden |
| AGB (öffentlich) | keine Klausel zu automatisiertem Zugriff | keine Klausel zu automatisiertem Zugriff; Shop-Preise = Netto-EK zzgl. Versand |

**Details für die Adapter (aus aufgezeichnetem HTML/JS):**
- Weichberger: Im Test kamen die Treffer mit und ohne Mengenfilter nach Netto-EK aufsteigend.
  Die Marke steht im Feld „Hersteller“ ausgeschrieben (z. B. `KUMHO`). In der Bezeichnung steht ein
  Kürzel (`KUM …`).
- Weichberger-Herstellerfilter bei 205/55 R16 (Startliste für Marken-Tags): BARUM, BRIDGESTONE,
  CONTINENTAL, DEBICA, DUNLOP, FALKEN, FIRESTONE, FULDA, GOODYEAR, HANKOOK, KUMHO, MICHELIN, NOKIAN,
  PIRELLI, SAVA, SEMPERIT, SUMITOMO, UNIROYAL, VREDESTEIN, YOKOHAMA. Das Suchformular nimmt eine
  Marke (`Manufacturer`); ob die Filterleiste mehrere Hersteller gleichzeitig erlaubt, ist nicht
  verifiziert. Göggel nimmt die Marke als Freitext (`hersteller`), der Saison-Filter ist ein Umschalter.
- Göggel: Sortierung per `func=filtereSuchergebnis&filterart=sortierung&filterwert=nettopreis`
  (Spaltenkopf „Preise“; ob Klick auf- oder absteigend sortiert, ist nicht verifiziert). Filter
  „nur verfügbare“ per `filterart=nurvfg&filterwert=vfg` (Umschalter). Die Marke steht im Feld
  „Hersteller“ ausgeschrieben. Die Stückzahl je Zeile steht im versteckten Feld `bestand<i>`.
- Göggel-Versand 6,50 €: In den Lieferbedingungen steht nicht, ob netto oder brutto. Die AGB nennen
  Shop-Preise netto.

**Reines HTTP getestet:** Beide Suchen liefern mit Session-Cookie und ohne Browser/JS dieselben
Ergebnisse wie im Browser.

## Entscheidung

- **Weichberger: (a) direkte HTTP-Requests.** Immer mit Mengenfilter suchen (schnell, nur lagernd).
  Eine eigene Session pro Suche, weil die Suche in der Server-Session liegt.
- **Göggel: (a) direkte HTTP-Requests.** „Nur verfügbare“ + Sortierung per Folge-Request; EAN per
  Detail-Request für die angezeigten Artikel.

Ein Playwright-Worker ist nicht nötig.

## Konsequenzen für das Design

1. **Suche = nur lagernd, günstigste zuerst**, in beiden Shops serverseitig gefiltert und sortiert;
   Marke nur, wenn gesetzt. Welche Menge als „lagernd“ zählt (≥ gewünschte Stückzahl), steuert der
   Mengenfilter.
2. **Eine Session pro Suche** (Login → Suche), damit sich parallele Suchen nicht überschreiben.
3. **Sicherheitsregel Warenkorb (Weichberger):** Vor jedem Ablegen prüft der Adapter die Einstellung
   „Automatische Bestellung“. Ist sie an, bricht er mit klarer Fehlermeldung ab.
4. **Versand** wird als feste Regel pro Shop hinterlegt (z. B. Göggel: < 2 Reifen 6,50 €/Stück, sonst 0).

## Entscheidungen (mit dem Nutzer geklärt, 2026-11-06)

| Thema | Entscheidung |
|---|---|
| Treffer | Beide Shops immer nach dem günstigsten Preis durchsuchen, nur lagernde Artikel, Marke nur filtern, wenn gesetzt; jede Zeile zeigt, aus welchem Shop sie stammt |
| Lagernd | Bestand ≥ gewünschte Stückzahl |
| Weichberger-Nebenlager | Wenn die Stückzahl nur mit dem Nebenlager (2–3 Tage) erreicht wird: anzeigen, **gelb markiert** |
| Preis für „günstigstes Angebot“ | Endkundenpreis inkl. Versand, für beide Shops **einheitlich** nach der Kalkulation des Onkels in Göggel: `Brutto-VK = rund_0,10((Netto-EK + Versand je Stück + 39 €) × 1,20)` (Göggel-Einstellung: Basis Netto-EK, Aufschlag 0 % + 39 €, Rundung 0,10 auf Brutto-VK). Aufschlag, Rundung und MwSt als Einstellung, nicht fest im Code |
| Versand Göggel | PKW: 1 Reifen 6,50 €/Stück, ab 2 Reifen frei Haus (laut Lieferbedingungen im Shop) |
| Versand Weichberger | Einstellbare Regel; Werte klärt der Nutzer mit dem Onkel (Hinweis: „ab 4 Reifen frei“) |
| Filter-UI | Saison, Marke und Stückzahl als antippbare Tags; Saison und Marke mit Mehrfachauswahl (kein Tag = alle); Größe (Breite/Höhe/Zoll) bleibt als Dropdown |
| Zugriffsschutz | Gemeinsamer Werkstatt-Code |
| Repo | Neues Repo |

## Stack-Vorschlag

- **Frontend:** Vite + React + TypeScript (wie die Einkaufsliste), statisch auf GitHub Pages.
  Dropdowns für Breite/Höhe/Zoll/Saison/Marke, Stückzahl mit +/−-Buttons, große Touch-Flächen.
- **Backend:** Supabase Edge Functions (Deno/TypeScript), eine Funktion `search` pro Shop-Aufruf
  (Göggel und Weichberger parallel, Ergebnisse erscheinen je Shop), später `cart`.
- **Zugangsdaten:** Supabase Secrets; lokal `supabase/functions/.env` (git-ignoriert).
- **Zugriffsschutz:** gemeinsamer Werkstatt-Code, den die Edge Function prüft (der Supabase-Anon-Key
  im Frontend ist öffentlich und schützt nichts).
- **Parsing:** deterministisch mit HTML-Parser (deno-dom) und festen Selektoren, dazu Plausibilitäts-
  prüfungen (Preis/Dimension parsebar, Trefferzahl > 0 bei bekannter Testgröße). Bricht ein Adapter,
  liefert er einen festen Fehlercode, den die UI anzeigt.
- **Matching:** reine TS-Funktion: EAN, sonst Marke + Profil + Dimension + LI/SI (normalisiert).
- **Tests:** `deno test` mit anonymisierten Fixtures aus `recon/`; Live-Tests nur mit `LIVE=1`.
- **Kein** Playwright-Worker, kein eigener Server.

## Offen / nicht verifiziert

- Versandregel Weichberger (Onkel: „ab 4 Reifen frei“?) und ob Göggels „ab 2 frei Haus“ auch nach Österreich gilt.
- Bestehendes Supabase-Projekt der Werkstatt mitnutzen oder neues Projekt?
- Warenkorb: Requests aufgezeichnet (siehe Tabelle). Offen: bleibt der Warenkorb nach Ab-/Anmelden
  erhalten (Gate aus Spec 3.4)? Weichberger-Seite „Automatische Bestellung“ noch nicht aufgezeichnet.
- Serverseitiges Session-Timeout bei Weichberger.
- Ob die Shops Requests aus Rechenzentrums-IPs (Supabase Edge) blocken → erster Spike in Phase 1.
