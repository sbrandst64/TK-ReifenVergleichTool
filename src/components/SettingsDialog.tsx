// "Einstellungen" → every text of the offer PDF as an input (spec 3.7, AC36–AC39).
// Edits stay in a draft until "Speichern"; "Abbrechen"/Escape discards them.
import { useEffect, useId, useRef, useState } from 'react'
import {
  DEFAULT_PDF_TEXTS,
  MAX_EXTRAS,
  MAX_TEXT_LENGTH,
  PDF_TEXT_FIELDS,
  type PdfTextKey,
  type PdfTexts,
} from '../../supabase/functions/_shared/pdf-texts.ts'

export interface SettingsDialogProps {
  texts: PdfTexts
  /** Shown when the stored texts could not be loaded. */
  warning?: string | null
  onSave: (texts: PdfTexts) => Promise<void>
  onClose: () => void
}

const GROUPS = [...new Set(PDF_TEXT_FIELDS.map((f) => f.group))]
const copy = (t: PdfTexts): PdfTexts => ({ ...t, extras: t.extras.map((e) => ({ ...e })) })

export function SettingsDialog({ texts, warning, onSave, onClose }: SettingsDialogProps) {
  const titleId = useId()
  const [draft, setDraft] = useState(() => copy(texts))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const setText = (key: PdfTextKey, value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const setExtra = (i: number, part: 'text' | 'price', value: string) =>
    setDraft((d) => ({
      ...d,
      extras: d.extras.map((e, j) => (j === i ? { ...e, [part]: value } : e)),
    }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
    } catch {
      setError('Texte wurden nicht gespeichert – bitte erneut versuchen')
      setSaving(false)
    }
  }

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal__head">
          <h2 id={titleId}>PDF-Texte</h2>
          <p className="modal__hint">
            Gilt für alle Geräte der Werkstatt. Neue Angebote nutzen die gespeicherten Texte.
          </p>
          {warning && <p className="modal__warning">{warning}</p>}
        </header>

        <form
          className="modal__body"
          id={`${titleId}-form`}
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {GROUPS.map((group) => (
            <fieldset key={group} className="settings-group">
              <legend>{group}</legend>
              {PDF_TEXT_FIELDS.filter((f) => f.group === group).map((f, i) => (
                <div key={f.key} className="settings-field">
                  <label htmlFor={`${titleId}-${f.key}`}>{f.label}</label>
                  <input
                    id={`${titleId}-${f.key}`}
                    ref={group === GROUPS[0] && i === 0 ? first : undefined}
                    value={draft[f.key]}
                    maxLength={MAX_TEXT_LENGTH}
                    onChange={(e) => setText(f.key, e.target.value)}
                  />
                </div>
              ))}
            </fieldset>
          ))}

          <fieldset className="settings-group">
            <legend>Zusatzpreise (nur Information, nicht im Gesamtpreis)</legend>
            {draft.extras.map((extra, i) => (
              <div key={i} className="settings-extra">
                <input
                  aria-label={`Zusatz ${i + 1} Text`}
                  value={extra.text}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(e) => setExtra(i, 'text', e.target.value)}
                />
                <input
                  aria-label={`Zusatz ${i + 1} Preis`}
                  className="settings-extra__price"
                  value={extra.price}
                  maxLength={MAX_TEXT_LENGTH}
                  onChange={(e) => setExtra(i, 'price', e.target.value)}
                />
                <button
                  type="button"
                  className="settings-extra__remove"
                  aria-label={`Zusatz ${i + 1} entfernen`}
                  onClick={() =>
                    setDraft((d) => ({ ...d, extras: d.extras.filter((_, j) => j !== i) }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button"
              disabled={draft.extras.length >= MAX_EXTRAS}
              onClick={() =>
                setDraft((d) => ({ ...d, extras: [...d.extras, { text: '', price: '' }] }))
              }
            >
              Zeile hinzufügen
            </button>
          </fieldset>
        </form>

        <footer className="modal__foot">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="button"
            onClick={() => setDraft(copy(DEFAULT_PDF_TEXTS))}
          >
            Auf Vorlage zurücksetzen
          </button>
          <span className="modal__spacer" />
          <button type="button" className="button" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            form={`${titleId}-form`}
            className="button button--confirm"
            disabled={saving}
          >
            {saving ? 'Speichert …' : 'Speichern'}
          </button>
        </footer>
      </div>
    </div>
  )
}
