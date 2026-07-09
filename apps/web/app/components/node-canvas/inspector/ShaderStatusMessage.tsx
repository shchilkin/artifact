export function ShaderStatusMessage({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning';
}) {
  return (
    <div className={`node-inspector-status node-inspector-status-${tone}`} role="status" aria-live="polite">
      <p className="node-inspector-status-title">{title}</p>
      <p className="node-inspector-status-copy">{message}</p>
    </div>
  );
}
