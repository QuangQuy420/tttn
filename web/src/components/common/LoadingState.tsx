interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <p role="status" className="loading-state">
      {label}
    </p>
  );
}
