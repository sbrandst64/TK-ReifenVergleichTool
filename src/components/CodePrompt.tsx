// Asks once for the shared workshop code (spec 3.6). Stored locally by the App.
import { useState } from 'react'

export function CodePrompt({
  error,
  onSave,
}: {
  error: string | null
  onSave: (code: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <form
      className="code"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave(value.trim())
      }}
    >
      <label htmlFor="werkstatt-code">Werkstatt-Code</label>
      <input
        id="werkstatt-code"
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="search__submit">
        Speichern
      </button>
    </form>
  )
}
