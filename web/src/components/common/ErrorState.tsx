interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <p role="alert" className="error-state">
      {message}
    </p>
  );
}
