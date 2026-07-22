interface EmptyTableState {
  message: string;
  title: string;
}

interface DataTableColumn {
  key: string;
  label?: React.ReactNode;
  screenReaderLabel?: string;
}

export function DataTable({
  children,
  columns,
  empty,
  label,
}: {
  children: React.ReactNode;
  columns: readonly DataTableColumn[];
  empty?: EmptyTableState;
  label: string;
}) {
  if (empty) return <EmptySection title={empty.title} message={empty.message} />;
  return (
    <div className="table-scroll" aria-label={label} role="region" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                {column.screenReaderLabel ? <span className="sr-only">{column.screenReaderLabel}</span> : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptySection({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-section">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}
