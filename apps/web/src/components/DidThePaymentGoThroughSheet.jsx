import Modal from './Modal.jsx'

export default function DidThePaymentGoThroughSheet({ open, recipientName, amountLabel, onYes, onNo }) {
  return (
    <Modal open={open} onClose={onNo}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Did the payment go through?
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {amountLabel} to {recipientName}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onNo} className="text-sm px-4 py-2 text-neutral-600 dark:text-neutral-300">
            Not yet
          </button>
          <button
            onClick={onYes}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Yes, mark as paid
          </button>
        </div>
      </div>
    </Modal>
  )
}
