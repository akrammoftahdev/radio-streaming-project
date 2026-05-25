"use client";

interface Props {
  message: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A submit button that shows a browser confirm() dialog before submitting.
 * Must be used inside a <form action={serverAction}> in the parent Server Component.
 * The onClick preventDefault pattern is only valid in Client Components.
 */
export default function ConfirmSubmitButton({ message, className, children }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
