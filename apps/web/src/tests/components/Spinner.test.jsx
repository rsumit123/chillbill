import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Spinner, ButtonSpinner } from '../../components/Spinner'

describe('Spinner Component', () => {
  it('renders with default size', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('w-8', 'h-8')
  })

  it('renders with small size', () => {
    const { container } = render(<Spinner size="sm" />)
    const svg = container.querySelector('svg')
    
    expect(svg).toHaveClass('w-4', 'h-4')
  })

  it('renders with large size', () => {
    const { container } = render(<Spinner size="lg" />)
    const svg = container.querySelector('svg')
    
    expect(svg).toHaveClass('w-12', 'h-12')
  })

  it('applies custom className', () => {
    const { container } = render(<Spinner className="text-red-500" />)
    const svg = container.querySelector('svg')
    
    expect(svg).toHaveClass('text-red-500')
  })
})

describe('ButtonSpinner Component', () => {
  it('renders with correct size for buttons', () => {
    const { container } = render(<ButtonSpinner />)
    const svg = container.querySelector('svg')
    
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('w-4', 'h-4')
  })
})

