# TDD-Nachweis: Erster Build (Phase 1 + 2)

Stand 2026-11-06, Branch `feat/erster-build`.

## Quelle

[docs/spec.md](../spec.md) v3, Akzeptanzkriterien AC1–AC26. Die User Journeys stammen aus der Spec
(Suche, Preis, Zusammenführen, Fehler). Den Warenkorb (Phase 3) deckt dieser Build nicht ab.

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
| 14 | Filterbereich farblich abgesetzt, Logos lesbar, Tags springen nicht (AC29, manuell) | Browser bei 375, 768, 1024, 1280 px | manuell |

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

- **Login gegen die echten Shops ist nicht getestet.** Die Accounts gehören dem Nutzer, Passwörter
  gibt Claude nicht ein. Prüfbar mit `supabase/functions/.env` und `npm run dev:api`.
- **Supabase-Spike (Rechenzentrums-IPs)** offen, weil noch kein Supabase-Projekt verbunden ist.
- **Warenkorb (Phase 3)** nicht begonnen, blockiert durch fehlende Accounts mit Warenkorb-Recht.
- **AC1/AC4** live nur manuell geprüft. Es gibt keinen automatisierten E2E-Test mit Playwright,
  weil der echte Shop-Zugang fehlt.
