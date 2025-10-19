import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from '../../components/Modal'

describe('Modal Component', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <div>Modal Content</div>
      </Modal>
    )
    
    expect(container.firstChild).toBeNull()
  })

  it('renders content when open', () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <div>Modal Content</div>
      </Modal>
    )
    
    expect(screen.getByText('Modal Content')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    
    const { container } = render(
      <Modal open={true} onClose={handleClose}>
        <div>Content</div>
      </Modal>
    )
    
    // Click the backdrop (first div)
    const backdrop = container.querySelector('[role="dialog"]').parentElement
    await user.click(backdrop)
    
    expect(handleClose).toHaveBeenCalled()
  })

  it('does not close when clicking modal content', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()
    
    render(
      <Modal open={true} onClose={handleClose}>
        <div data-testid="modal-content">Content</div>
      </Modal>
    )
    
    await user.click(screen.getByTestId('modal-content'))
    
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('prevents body scroll when open', () => {
    const { rerender } = render(
      <Modal open={false} onClose={() => {}}>
        <div>Content</div>
      </Modal>
    )
    
    expect(document.body.style.overflow).not.toBe('hidden')
    
    rerender(
      <Modal open={true} onClose={() => {}}>
        <div>Content</div>
      </Modal>
    )
    
    expect(document.body.style.overflow).toBe('hidden')
    
    rerender(
      <Modal open={false} onClose={() => {}}>
        <div>Content</div>
      </Modal>
    )
    
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

