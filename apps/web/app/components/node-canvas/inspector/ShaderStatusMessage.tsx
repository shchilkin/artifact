import { InspectorStatus } from '../../inspector-system';

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
    <InspectorStatus title={title} tone={tone}>
      {message}
    </InspectorStatus>
  );
}
