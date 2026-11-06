// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TagGroup } from './TagGroup.tsx'

const options = ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: `Tag ${v}` }))

describe('TagGroup', () => {
  it('AC5a: multi mode toggles a tag on and off', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <TagGroup
        label="Marke"
        options={options}
        selected={['A']}
        onChange={onChange}
        mode="multi"
      />,
    )
    await user.click(screen.getByRole('button', { name: /Tag B/ }))
    expect(onChange).toHaveBeenLastCalledWith(['A', 'B'])
    await user.click(screen.getByRole('button', { name: /Tag A/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
    rerender(
      <TagGroup
        label="Marke"
        options={options}
        selected={['B']}
        onChange={onChange}
        mode="multi"
      />,
    )
    expect(screen.getByRole('button', { name: /Tag B/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC5a: selecting keeps the label unchanged (no check mark, so tags do not shift)', () => {
    render(
      <TagGroup
        label="Marke"
        options={options}
        selected={['C']}
        onChange={() => {}}
        mode="multi"
      />,
    )
    const active = screen.getByRole('button', { name: 'Tag C' })
    expect(active).toHaveTextContent(/^Tag C$/)
    expect(active).toHaveAttribute('aria-pressed', 'true')
    expect(active).toHaveClass('tag--active')
    expect(screen.getByRole('button', { name: 'Tag A' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC5a: single mode replaces the selection and never deselects', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TagGroup
        label="Stückzahl"
        options={options}
        selected={['A']}
        onChange={onChange}
        mode="single"
      />,
    )
    await user.click(screen.getByRole('button', { name: /Tag C/ }))
    expect(onChange).toHaveBeenLastCalledWith(['C'])
    await user.click(screen.getByRole('button', { name: /Tag A/ }))
    expect(onChange).toHaveBeenLastCalledWith(['A'])
  })

  it('is a labelled group', () => {
    render(
      <TagGroup label="Saison" options={options} selected={[]} onChange={() => {}} mode="multi" />,
    )
    expect(screen.getByRole('group', { name: 'Saison' })).toBeInTheDocument()
  })

  it('shows only the first tags until expanded, but always the selected ones', async () => {
    const user = userEvent.setup()
    render(
      <TagGroup
        label="Marke"
        options={options}
        selected={['D']}
        onChange={() => {}}
        mode="multi"
        collapsedCount={2}
        moreLabel="Alle Marken anzeigen"
      />,
    )
    expect(screen.getAllByRole('button', { name: /^Tag/ })).toHaveLength(3) // A, B + selected D
    await user.click(screen.getByRole('button', { name: 'Alle Marken anzeigen' }))
    expect(screen.getAllByRole('button', { name: /^Tag/ })).toHaveLength(4)
  })
})
