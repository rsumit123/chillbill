import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from '../../components/Avatar'

describe('Avatar Component', () => {
  it('renders avatar with initials', () => {
    render(<Avatar name="John Doe" size={32} />)
    
    const avatar = screen.getByTitle('John Doe')
    expect(avatar).toBeInTheDocument()
    expect(avatar).toHaveTextContent('JD')
  })

  it('renders avatar with single name', () => {
    render(<Avatar name="Alice" size={32} />)
    
    const avatar = screen.getByTitle('Alice')
    expect(avatar).toBeInTheDocument()
    expect(avatar).toHaveTextContent('A')
  })

  it('renders ghost member indicator', () => {
    const { container } = render(<Avatar name="Ghost User" size={32} ghost={true} />)
    
    // Check for offline indicator
    const offlineIcon = container.querySelector('svg')
    expect(offlineIcon).toBeInTheDocument()
  })

  it('applies correct size styling', () => {
    const { container } = render(<Avatar name="Test" size={48} />)
    
    const avatar = container.firstChild
    expect(avatar).toHaveStyle({ width: '48px', height: '48px' })
  })

  it('generates consistent colors for same name', () => {
    const { container: container1 } = render(<Avatar name="Alice" size={32} />)
    const { container: container2 } = render(<Avatar name="Alice" size={32} />)
    
    const style1 = container1.firstChild.style.backgroundColor
    const style2 = container2.firstChild.style.backgroundColor
    
    expect(style1).toBe(style2)
  })
})

