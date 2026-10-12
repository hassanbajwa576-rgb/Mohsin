'use client';

// Submit button that asks for confirmation first, so a delete is never one accidental tap.
export default function ConfirmButton({ message, className, children }) {
  return (
    <button
      type='submit'
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
