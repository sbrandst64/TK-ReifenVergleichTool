# Reifen-Preisvergleich

Sucht Reifen gleichzeitig bei **Weichberger** und **Göggel**, zeigt nur lagernde Angebote mit
Endkundenpreis, führt gleiche Reifen zusammen und markiert das günstigste Angebot.

- Spec: [docs/spec.md](docs/spec.md) · Analyse: [docs/phase0-recon.md](docs/phase0-recon.md) ·
  Testnachweis: [docs/testing/erster-build.tdd.md](docs/testing/erster-build.tdd.md)
- Kein KI-Einsatz zur Laufzeit, kein automatisches Bestellen, Zugangsdaten nur serverseitig.

| Ordner                         | Inhalt                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| `src/`                         | Oberfläche (React + Vite + TypeScript)                             |
| `supabase/functions/_shared/`  | Shop-Adapter, Preisberechnung, Matching, Handler (laufzeitneutral) |
| `supabase/functions/search/`   | Edge Function Suche (Deno)                                         |
| `supabase/functions/cart/`     | Edge Function Warenkorb (Deno), bestellt nie                       |
| `supabase/functions/settings/` | Edge Function PDF-Texte (Deno)                                     |
| `.github/workflows/`           | Prüfen bei jedem Push, Veröffentlichen auf GitHub Pages von `main` |
| `scripts/`                     | lokaler Dev-Server, Fixture-Anonymisierung                         |
| `test/`                        | Backend-Tests und anonymisierte Fixtures                           |

## Lokal starten

```bash
npm install
```

1. `supabase/functions/.env.example` nach `supabase/functions/.env` kopieren und Werkstatt-Code
   sowie Shop-Zugangsdaten eintragen. Die Datei ist von Git ausgeschlossen.
2. In einem Terminal die API starten:

```bash
npm run dev:api
```

3. In einem zweiten Terminal die Oberfläche starten:

```bash
npm run dev
```

4. http://localhost:5173 öffnen und den Werkstatt-Code eingeben.

## Prüfen

```bash
npm test
```

```bash
npm run test:coverage
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run check:deno
```

```bash
npm run build
```

## Live schalten

Zwei Teile: der **Server** (Supabase Edge Functions, meldet sich bei den Shops an) und die
**Oberfläche** (GitHub Pages). Zugangsdaten gibt nur der Mensch ein, nie in den Chat, nie ins Repo.

### 1. Supabase (einmalig)

1. Auf supabase.com ein Projekt anlegen (Region Europa). Die **Project Reference** steht in der
   Adresse, z. B. `https://abcdefgh.supabase.co` → `abcdefgh`.
2. Anmelden und das Repo mit dem Projekt verbinden (fragt nach der Project Reference und dem
   Datenbank-Passwort):

```bash
npm run supabase:login
```

```bash
npm run supabase:link
```

3. Tabelle für die PDF-Texte anlegen (`supabase/migrations/`):

```bash
npm run deploy:db
```

4. Secrets: `supabase/functions/.env.example` nach `supabase/functions/.env.production` kopieren
   (von Git ausgeschlossen) und ausfüllen:
   - `WERKSTATT_CODE`: ein **neuer, langer** Code (nicht der lokale)
   - die vier Shop-Zugangsdaten
   - `ALLOWED_ORIGINS`: nur die Adresse der Seite ohne Pfad, z. B. `https://<name>.github.io`
   - Zeilen ohne Wert löschen (z. B. `SHIPPING_WEICHBERGER=`, solange die Regel offen ist)

```bash
npm run deploy:secrets
```

5. Die drei Funktionen hochladen (`supabase/config.toml` schaltet die Supabase-Anmeldung ab, der
   Werkstatt-Code schützt sie):

```bash
npm run deploy:functions
```

6. Probe ohne Shop-Kontakt: Mit falschem Code muss `401` kommen.

```bash
curl -i -X POST https://<projekt>.supabase.co/functions/v1/search -H "content-type: application/json" -H "x-werkstatt-code: falsch" -d "{}"
```

Danach eine echte Suche in der Oberfläche. Am 2026-11-10 geprüft: Beide Shops lassen Anfragen aus
Supabase Frankfurt zu (Weichberger ca. 7 s, Göggel ca. 17 s). Zeigt die UI später „Shop blockiert
Anfragen“, hat ein Shop das geändert.

### 2. GitHub (einmalig)

1. Repo anlegen. **Privat** empfohlen: Im Code stehen Aufschlag, Shops, ÖAMTC-Daten und das
   Werkstatt-Logo. GitHub Pages für private Repos braucht GitHub Pro; öffentlich ist es gratis.
2. Den Stand nach `main` bringen und hochladen (z. B. GitHub Desktop → „Publish repository“).
3. Settings → **Pages** → Source: **GitHub Actions**.
4. Settings → **Secrets and variables → Actions → Variables** → `VITE_API_BASE` =
   `https://<projekt>.supabase.co/functions/v1`.
5. Jeder Push auf `main` prüft (Typen, Lint, Format, Tests, Deno) und veröffentlicht die Seite unter
   `https://<name>.github.io/<repo>/`. Status unter **Actions**.

### 3. Danach

- Seite öffnen, neuen Werkstatt-Code eingeben, suchen; Warenkorb einmal selbst testen.
- Beim Onkel als Lesezeichen bzw. auf dem Handy „Zum Startbildschirm“.
- Code-Änderungen: Push auf `main` (Oberfläche) bzw. `npm run deploy:functions` (Server).
  Neue ÖAMTC-Tests: `npm run oeamtc:import`, Tests laufen lassen, committen.

## Konfiguration (Supabase-Secrets)

Alle Werte stehen mit Erklärung in `supabase/functions/.env.example`. Wichtig sind:

- `WERKSTATT_CODE`, `WEICHBERGER_USER/_PASSWORD`, `GOEGGEL_USER/_PASSWORD`
- `ALLOWED_ORIGINS`: die GitHub-Pages-Adresse
- `PRICE_MARKUP_EUR` (39), `VAT_PERCENT` (20), `PRICE_ROUNDING_EUR` (0.10)
- `SHIPPING_GOEGGEL` (`freeFrom=2;perUnit=6.50`), `SHIPPING_WEICHBERGER` (noch offen)

Für das Frontend wird beim Build `VITE_API_BASE` auf `https://<projekt>.supabase.co/functions/v1`
gesetzt.

## Test-Fixtures erneuern

Rohmitschnitte liegen in `recon/raw/` (git-ignoriert). Danach:

```bash
npm run fixtures -- --forbid=<Kundennummer>,<Firmenname>
```

Das Skript ersetzt echte EK durch synthetische Werte in gleicher Reihenfolge, setzt alle anderen
Preise auf 0, nullt Session-IDs und bricht ab, wenn einer der verbotenen Begriffe übrig bleibt.
