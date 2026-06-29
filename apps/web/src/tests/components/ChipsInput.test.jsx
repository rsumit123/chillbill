import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChipsInput from '../../components/ChipsInput.jsx'

function setup(initial = []) {
  let value = initial
  const onChange = vi.fn((next) => { value = next })
  const utils = render(<ChipsInput value={value} onChange={onChange} placeholder="emails" />)
  return { onChange, getInput: () => screen.getByPlaceholderText('emails'), ...utils }
}

describe('ChipsInput', () => {
  it('splits a comma-separated blur into multiple chips', async () => {
    const { onChange, getInput } = setup()
    const user = userEvent.setup()
    await user.click(getInput())
    fireEvent.change(getInput(), { target: { value: 'a@b.com, c@d.com' } })
    fireEvent.blur(getInput())
    expect(onChange).toHaveBeenLastCalledWith(['a@b.com', 'c@d.com'])
  })

  it('splits a space-separated blur into multiple chips', () => {
    const { onChange, getInput } = setup()
    fireEvent.change(getInput(), { target: { value: 'a@b.com c@d.com' } })
    fireEvent.blur(getInput())
    expect(onChange).toHaveBeenLastCalledWith(['a@b.com', 'c@d.com'])
  })

  it('commits a single value on blur unchanged', () => {
    const { onChange, getInput } = setup()
    fireEvent.change(getInput(), { target: { value: 'solo@example.com' } })
    fireEvent.blur(getInput())
    expect(onChange).toHaveBeenLastCalledWith(['solo@example.com'])
  })

  it('does nothing on blur if input is empty', () => {
    const { onChange, getInput } = setup()
    fireEvent.blur(getInput())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('comma keypress commits and clears input', () => {
    const { onChange, getInput } = setup()
    fireEvent.change(getInput(), { target: { value: 'first@x.com' } })
    fireEvent.keyDown(getInput(), { key: ',' })
    expect(onChange).toHaveBeenLastCalledWith(['first@x.com'])
  })

  it('paste with commas splits into multiple chips', () => {
    const { onChange, getInput } = setup()
    fireEvent.paste(getInput(), { clipboardData: { getData: () => 'a@b.com, c@d.com' } })
    expect(onChange).toHaveBeenLastCalledWith(['a@b.com', 'c@d.com'])
  })

  it('deduplicates existing values', () => {
    const { onChange, getInput } = setup(['a@b.com'])
    fireEvent.change(getInput(), { target: { value: 'a@b.com, c@d.com' } })
    fireEvent.blur(getInput())
    expect(onChange).toHaveBeenLastCalledWith(['a@b.com', 'c@d.com'])
  })
})
