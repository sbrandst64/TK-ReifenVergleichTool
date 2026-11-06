# Reifen-Preisvergleich

Sucht Reifen gleichzeitig bei **Weichberger** und **Göggel**, zeigt nur lagernde Angebote mit
Endkundenpreis, führt gleiche Reifen zusammen und markiert das günstigste Angebot.

- Spec: [docs/spec.md](docs/spec.md) · Analyse: [docs/phase0-recon.md](docs/phase0-recon.md) ·
  Testnachweis: [docs/testing/erster-build.tdd.md](docs/testing/erster-build.tdd.md)
- Kein KI-Einsatz zur Laufzeit, kein automatisches Bestellen, Zugangsdaten nur serverseitig.

| Ordner | Inhalt |
|---|---|
| `src/` | Oberfläche (React + Vite + TypeScript) |
| `supabase/functions/_shared/` | Shop-Adapter, Preisberechnung, Matching, Handler (laufzeitneutral) |
| `supabase/functions/search/` | Edge Function (Deno) |
| `scripts/` | lokaler Dev-Server, Fixture-Anonymisierung |
| `test/` | Backend-Tests und anonymisierte Fixtures |

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
