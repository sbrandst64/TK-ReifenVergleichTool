# TDD-Nachweis: Erster Build (Phase 1 + 2)

Stand 2026-11-06, Branch `feat/erster-build`.

## Quelle

[docs/spec.md](../spec.md) v3, Akzeptanzkriterien AC1–AC26. Die User Journeys stammen aus der Spec
(Suche, Preis, Zusammenführen, Fehler). Der Warenkorb (Phase 3) kam am 2026-11-09 dazu (Zeilen 31–35).

## Ablauf (Checkpoint-Commits)

| Commit | Stufe | Befehl | Ergebnis |
|---|---|---|---|
| `f691e1a` | RED Backend | `npx vitest run test/backend` | 83 failed / 1 passed (84). Die Fehler kommen aus den Stubs („not implemented“). Der eine grüne Test ist durch den werfenden Stub trivial erfüllt. |
| `4004de8` | GREEN Backend | `npx vitest run test/backend` | 133 passed (133). Zusatztest Göggel-Zeile ohne LI/SI: erst RED (2 failed), dann GREEN. |
| `3b9096e` | Refactor + Infrastruktur | `npx vitest run test/backend`, `deno check …`, Deno-Laufzeittest | 133 passed, `deno check` OK, 401/LOGIN_FAILED wie erwartet |
| `13b550a` | RED UI | `npx vitest run src` | 27 failed (27), Ursache: leere Stubs |
| `728d948` | GREEN UI | `npx vitest run --coverage` | 160 passed (160), Coverage siehe unten |

## Garantien

| # | Was garantiert ist | Test | Typ |
|---|---|---|---|
| 1 | Endkundenpreis = rund_0,10((EK + Versand + 39 €) × 1,2) in Cent-Arithmetik (AC8–AC10) | `test/backend/pricing.test.ts` | unit |
| 2 | Göggel-Versand 6,50 € unter 2 Stück, Weichberger-Regel einstellbar, fehlende Regel → Hinweis (AC11) | `pricing.test.ts`, `config.test.ts` | unit |
| 3 | Konfiguration aus Secrets mit Standardwerten; ohne Werkstatt-Code startet die Function nicht (AC12) | `config.test.ts` | unit |
| 4 | Größe, LI/SI und Profil werden aus beiden Shop-Schreibweisen gelesen | `tire.test.ts` | unit |
| 5 | Matching: gleiche EAN → eine Gruppe, sonst Schlüssel, nie über verschiedene LI/SI, Gleichstand → beide günstigste (AC13–AC15, AC17) | `matching.test.ts` | unit |
| 6 | HTTP-Session: Cookies, Redirects, Timeout → TIMEOUT, 403/429 → BLOCKED, sonstige Fehler → UPSTREAM_ERROR | `http-session.test.ts` | unit |
| 7 | Nicht freigegebene Endpunkte (Checkout, Warenkorb, fremde Hosts) werden abgelehnt, **bevor** eine Anfrage rausgeht (AC21) | `http-session.test.ts`, `weichberger.test.ts`, `goeggel.test.ts` | unit |
| 8 | Weichberger: Login, Suche mit Lagerfilter, Blättern bis N, Marke/Saison je Kombination, falsche Daten → LOGIN_FAILED, Login-Seite → SESSION_EXPIRED (AC2, AC3, AC6, AC22, AC24) | `weichberger.test.ts` (Fake-Shop + anonymisierte Fixtures) | integration |
| 9 | Göggel: Login, Blättern bis N lagernde Angebote, „nur verfügbare“ wird eingeschaltet, EAN aus Detail, EAN-Fehler nicht fatal (AC2, AC3, AC6, AC13) | `goeggel.test.ts` | integration |
| 10 | Fehlendes Pflichtfeld im Shop-HTML → LAYOUT_CHANGED statt falscher Preise (AC23) | `weichberger.test.ts`, `goeggel.test.ts` | unit |
| 11 | Handler: Werkstatt-Code (401), Validierung (400), CORS, Timeout, Fehlercodes; Antwort ohne EK und ohne Zugangsdaten (AC24–AC26) | `search-handler.test.ts` | integration |
| 12 | UI: Tags → Suchanfrage, Shop einzeln sichtbar, Fehlermeldungen, leerer Zustand, „Günstigster (vorläufig)“, gelb, Code-Abfrage bei 401, alte Antworten verworfen (AC3–AC5a, AC7, AC11, AC13, AC16, AC22, AC25) | `src/App.test.tsx`, `src/components/TagGroup.test.tsx`, `src/api.test.ts` | component |
| 13 | Tag-Auswahl ändert die Beschriftung nicht (kein Häkchen); Anbieter-Filter fragt nur den gewählten Shop ab; jede Zeile zeigt das Shop-Logo auf dem Shopschild (AC5a, AC27, AC28). RED: cc32639, 0c4d47f | `src/components/TagGroup.test.tsx`, `src/App.test.tsx` | component |
| 15 | Jedes Angebot hat genau einen Verfügbarkeits-Tag: Lagernd (grün), 2–3 Tage (gelb), Nicht lagernd (rot) (AC16, AC30). RED: 0ad2b6c | `src/components/ResultList.test.tsx`, `src/App.test.tsx` | component |
| 16 | Auswahl per Checkbox bleibt über Suchen erhalten, Entfernen/Aufheben; PDF-Knopf fragt die Such-API nicht an (AC31, AC35). RED: ac4490d | `src/App.test.tsx` | component |
| 17 | Angebots-PDF: leere Kundenfelder, Datum/Dimension/Stück, Zeilen mit LI/SI und Preis, Saison-Häkchen, Gesamtpreis = Summe Stück × Preis, Seitenumbruch ohne Zeilenverlust (AC32–AC34). RED: ac4490d | `src/pdf/offer-model.test.ts`, `src/pdf/offer-pdf.test.ts` | unit |
| 18 | PDF-Layout gegen Excel-Vorlage (2 und 9 Zeilen), mit der Windows-PDF-Engine als Bild gerendert | manuell | manuell |
| 19 | PDF-Texte: Einstellungen-Fenster vorbefüllt, Speichern zentral, nächstes PDF nutzt die Texte, Zusatzzeilen hinzufügen/entfernen, Vorlage zurücksetzen, Fehler beim Speichern (AC36–AC39). RED: 41c9d8d | `src/App.test.tsx`, `src/settings-api.test.ts`, `src/pdf/offer-pdf.test.ts` | component |
| 20 | Dienst `settings`: Vorlage solange leer, 401/400/413/405/500/502, Prüfung der Texte, Supabase-Ablage per PostgREST (AC40) | `test/backend/settings-handler.test.ts`, `pdf-texts.test.ts`, `settings-store-supabase.test.ts` | integration |
| 21 | Göggel: JS-Weiterleitung auf login.php = SESSION_EXPIRED statt LAYOUT_CHANGED (AC41) | `test/backend/goeggel.test.ts` | unit |
| 22 | PDF-Texte live: speichern am PC, über WLAN-Adresse mit gleichem Ergebnis gelesen, PDF mit neuen Texten gerendert | manuell | manuell |
| 23 | Ladekreis statt Punkte pro Shop beim Laden. RED: 7009a4c | `src/App.test.tsx` | component |
| 24 | Auswahl-Liste und „Auswahl aufheben“ links unter „Suchen“, „Angebot als PDF“ schwebt außerhalb unten rechts (AC31). RED: 1181656 | `src/App.test.tsx` | component |
| 25 | Haken übernimmt die gerade im Filter markierte Stückzahl (ohne neue Suche), spätere Änderungen lassen Gewähltes unverändert; PDF: Zeilen sind Alternativen – „Stück“ nennt jede Zahl einmal, Gesamtpreis nur bei genau einem Reifen, sonst leeres ausfüllbares Feld (AC31, AC32, AC34). RED: 4f45401 | `src/App.test.tsx`, `src/pdf/offer-model.test.ts`, `src/pdf/offer-pdf.test.ts` | component/unit |
| 26 | Logo „TK Kopf GmbH“ links oben vor dem Titel (PC: oben im linken Panel, Handy: in der Kopfzeile). RED: 5f17afc | `src/App.test.tsx` | component |
| 27 | Kopf zeigt die Logos von Weichberger und Göggel als Links; Klick öffnet den Shop in neuem Tab (`noopener noreferrer`), die App bleibt offen (AC42). RED: 24521a1 | `src/App.test.tsx` | component |
| 28 | ÖAMTC-Gesamtnote und Urteil unter dem Reifennamen, wenn Marke, Modell und Größe in der Winter-2026-Tabelle stehen; sonst nichts. Nur Anzeige, nicht im PDF (AC43). RED: 58d0532 | `src/oeamtc-ratings.test.ts`, `src/App.test.tsx` | `src/App.test.tsx` | component |
| 29 | Auswahl hat einen eigenen Bereich außerhalb von Filter und Reifenliste, mit Liste, „Auswahl aufheben“ und „Angebot als PDF“ (AC31, Wunsch 2026-11-09; ersetzt Zeile 24). PC ab 1280 px: Spalte am rechten Rand, im Browser geprüft bei 1440/1400/1280/1100/375 px. RED: 68036c5 | `src/App.test.tsx` | component |
| 30 | Auswahl-Zeile zeigt das Mini-Logo ihres Shops; „Speichern“ in den Einstellungen ist grün (hatte eine Klasse ohne Styles). RED: 72820e1 | `src/App.test.tsx` | component |
| 31 | Weichberger-Warenkorb: liest zuerst „Automatische Bestellung“ (an → AUTO_ORDER_ENABLED, unlesbar oder widersprüchlich → AUTO_ORDER_UNKNOWN, jeweils ohne Ablage), legt dann je Reifen mit Stückzahl ab; abgelehnte Reifen einzeln gemeldet (AC19, AC20). Parser gegen die echte Seite geprüft. RED: a533c3e | `test/backend/weichberger-cart.test.ts` | unit + adapter |
| 32 | Göggel-Warenkorb: sucht die Größe in derselben Sitzung, blättert bis zur Artikelnummer, sendet das Formular der Trefferseite mit der Stückzahl nur in dieser Zeile, prüft die Position auf der Warenkorb-Seite; nicht gefunden → ITEM_NOT_FOUND ohne Ablage (AC44). RED: a533c3e | `test/backend/goeggel-cart.test.ts` | unit + adapter |
| 33 | Freigabeliste: Checkout, Bestellschritt, Bestellungen, Einstellungen ändern, Warenkorb leeren/löschen werden abgelehnt, bevor etwas an den Shop geht (AC21). RED: a533c3e | `test/backend/weichberger-cart.test.ts`, `test/backend/goeggel-cart.test.ts` | unit |
| 34 | Dienst `cart`: 401 ohne Code, 400 bei ungültiger Anfrage (u. a. doppelter Artikel, Stückzahl außerhalb 1–20), ein Ergebnis je Reifen, Shop-Fehler ohne Details, Timeout (AC25). RED: a533c3e | `test/backend/cart-handler.test.ts` | integration |
| 35 | „In den Warenkorb“: ein Aufruf je Shop mit den Stückzahlen, „Im Warenkorb“ oder Fehler je Reifen, Shop-Fehler von Weichberger hindert Göggel nicht, zweiter Klick legt nichts doppelt ab (AC18–AC20 in der UI). RED: 792551f | `src/App.test.tsx`, `src/api.test.ts` | component |
| 36 | ÖAMTC: alle 20 Pkw-Reifentests seit 2018 (488 Ergebnisse) mit Test, Größe, Note und Link auf die Reifenseite; neuester Test gewinnt; „Nokian Tyres“ = „Nokian“; Daten geprüft (Note = Reifenseite, Urteil passt zur Notengrenze, Größe auf der Testseite genannt). Live: 205/55 R16 6 von 40, 185/65 R15 16 von 35, 225/40 R18 8 von 40, 225/50 R17 13 von 40 Angeboten mit Note (AC43). RED: 6631d4a | `src/oeamtc-ratings.test.ts`, `src/App.test.tsx` | unit + component |
| 37 | ÖAMTC-Namensvarianten: 31 von Hand geprüfte Schreibweisen (u. a. Göggels Hankook-Profilcodes, Kumho-Kurznamen, Tippfehler), „General Tire“ = „General“, hochgestellte Ziffern; ÖAMTCs eigene Doppel-Schreibweise wird auf beiden Seiten zusammengeführt; Sonderversionen (AO, MO, *, Runflat) bekommen keine Note. Jede Variante zeigt auf einen getesteten Reifen. Grundlage: Lese-Scan beider Shops, 218 Marken-Größen-Kombinationen, 1698 Shop-Reifen; Treffer 237 → 278. Live-Standardsuche: 205/55 R16 6 → 12, 185/65 R15 16 → 22, 225/50 R17 13 → 15 von 35–40 Angeboten (AC43). RED: 875adb6 | `src/oeamtc-ratings.test.ts` | unit |
| 38 | Angebots-PDF: Gesamtpreis = Summe aller Zeilen (Stück × VK-Preis/Stück), auch bei mehreren Reifen; cent-genau, Zusatzpreise gehen nicht ein, Feld bleibt änderbar (AC34, Wunsch 2026-11-10). RED: 4f46002 | `src/pdf/offer-model.test.ts`, `src/pdf/offer-pdf.test.ts` | unit |
| 39 | ÖAMTC-Wertung in jeder Angebotszeile statt unter dem Reifennamen: kleines ÖAMTC-Logo, Sterne = 5,5 − Gesamtnote (0,5 = 5, 5,5 = 0, auf ein Zehntel), Note in der Farbe ihres Urteils (alle 5 Urteile der Daten haben eine Farbe), Test, alles ein Link auf die ÖAMTC-Reifenseite; ungetestete Größen zeigen nichts. Browser geprüft bei 375 px, 764 px (Wertung unter der Lieferzeile) und 1440 px (eine Zeile, Sterne und Preise bündig) (AC43, Wunsch 2026-11-10). RED: cdbb9bc | `src/oeamtc-ratings.test.ts`, `src/App.test.tsx` | unit + component |
| 40 | Weichberger-Angebote tragen die Saison aus dem Saison-Symbol der Trefferzeile (Winter, Sommer, Ganzjahres); unbekanntes Symbol → keine Saison. Symbolnamen live gelesen am 2026-11-10; in der Liste steht jetzt „· Winter“ auch bei Weichberger (AC45). RED: b6fb9d9 (eine Testannahme zur Fixture im GREEN-Commit 249a74c korrigiert: sie enthält alle drei Saisonen) | `test/backend/weichberger.test.ts` | unit |
| 41 | EAN-Speicher für Göggel: bekannte EANs aus dem Speicher, der Shop wird nur nach fehlenden gefragt, neue werden gespeichert; alle bekannt → kein Detail-Request; Speicher nicht lesbar/schreibbar → Suche liefert trotzdem; fehlende EAN wird nicht gespeichert; Supabase-Tabelle `goeggel_ean` nur mit Service-Key, ungültige Artikelnummern kommen nie in die Anfrage. Lokal gemessen (40 Angebote): Göggel 30,8 s → 3,4 s (AC46). RED: 74d1884 | `test/backend/goeggel.test.ts`, `test/backend/ean-cache-supabase.test.ts`, `test/backend/search-handler.test.ts` | unit |
| 42 | Hinweis „Kein Reifen ist in beiden Shops lagernd.“ (ohne Marken-Tag mit Rat, eine Marke zu wählen), nur wenn beide Shops Angebote geliefert haben und keine gemeinsame Gruppe da ist; Standard 40 statt 20 Angebote je Shop. Lokal gemessen 205/55 R16 ohne Filter: 0 → 5 gemeinsame Reifen (AC47). RED: 17c4f90 | `src/App.test.tsx`, `test/backend/config.test.ts` | component + unit |
| 43 | Die Liste erscheint in einem Zug: Wartezeile „Suche läuft …“, erster Shop wird bis zur Antwort des zweiten zurückgehalten (höchstens 8 s, danach erscheint er allein und der zweite wird ergänzt); kein Warten bei Fehler oder nur einem Shop. Lokal: Liste nach rund 9,5 s vollständig, kein Umsortieren (AC48, AC4). RED: 366c27b | `src/App.test.tsx` | component |
| 44 | Der Bereich „Auswahl“ ist von Anfang an da (leer: Hinweis ohne Knöpfe) und die Seite hält die Spalte frei; ohne Werkstatt-Code weder Bereich noch Spalte (AC49). RED: 366c27b | `src/App.test.tsx` | component |
| 14 | Filterbereich farblich abgesetzt, Logos lesbar, Tags springen nicht (AC29, manuell) | Browser bei 375, 768, 1024, 1280 px | manuell |
| 45 | Beim ersten Haken ändern sich Breite und Zeilenhöhe der Liste nicht (AC49): gemessen bei 1440 px (Liste 721 px, alle Zeilen 54 px vor und nach dem Haken); Zeilen ohne Überlauf bei 1280, 1366, 1440, 1920 px | Browser, `getBoundingClientRect` | manuell |
| 46 | Aktionsleiste unten statt schwebender Knöpfe (AC50): 375 px (zwei Knöpfe je 167 × 48 px, keine horizontale Scrollleiste), 768 px, 1100 px (Leiste beginnt rechts neben dem Filter) | Browser | manuell |

## Zusätzlich manuell verifiziert (nicht automatisiert)

- **Live-Suche** mit dem echten Adapter-Code und gespeicherter Browser-Session (ohne Login):
  - Weichberger: 20 Angebote in 6,5 s; Marke+Saison wirkt (MICHELIN Winter: 3 Treffer).
  - Göggel: 20 Angebote in 18,6 s, davon ≈ 13 s für die EAN-Abfragen.
- **Ende-zu-Ende im Browser** (Demo-API mit gespeicherter Session): beide Shops, Zusammenführen
  (BRIDGESTONE: 7 gemeinsame Karten), Gelb- und „vorläufig“-Markierung sichtbar.
- **AC5:** Bei 375 px keine horizontale Scrollleiste, kleinste Tippfläche 44 px.
- **Deno:** `deno check` OK; Function unter Deno gestartet, 401 bzw. LOGIN_FAILED wie erwartet.

## Coverage

`npx vitest run --coverage` → Statements 96,21 %, Branches 88,51 %, Functions 98,63 %,
Lines 99,02 % (Schwelle 80 %).

## Bekannte Lücken

- **Login gegen die echten Shops ist nur manuell geprüft** (2026-11-09, `npm run dev:api` mit den
  vom Nutzer eingetragenen Zugangsdaten in `supabase/functions/.env`): Suche 205/55 R16 liefert bei
  beiden Shops 20 Angebote ohne Fehler (Göggel ca. 16 s, Weichberger ca. 7 s), in der UI zusätzlich
  185/65 R15 Winter mit ÖAMTC-Zeile (AC43). Kein automatisierter Live-Test.
- **Supabase-Spike (Rechenzentrums-IPs)** offen, weil noch kein Supabase-Projekt verbunden ist.
- **Warenkorb (Phase 3): kein Live-Schreibtest.** Die Ablage ist nur gegen Fixtures und
  aufgezeichnete Seiten geprüft (lesend auch gegen die echten Seiten: Einstellung „aus“, Warenkorb
  leer). AC18 prüft der Nutzer selbst. Ob der Warenkorb am Account hängt, ist nicht belegt.
- **AC1/AC4** live nur manuell geprüft. Es gibt keinen automatisierten E2E-Test mit Playwright,
  weil der echte Shop-Zugang fehlt.
