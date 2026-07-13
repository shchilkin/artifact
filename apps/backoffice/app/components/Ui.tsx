import { Form, Link, useLocation } from 'react-router';

interface EmptyTableState {
  message: string;
  title: string;
}

interface DataTableColumn {
  key: string;
  label?: React.ReactNode;
  screenReaderLabel?: string;
}

export function PageHeader({
  actions,
  eyebrow,
  summary,
  title,
}: {
  actions?: React.ReactNode;
  eyebrow: string;
  summary: string;
  title: string;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-summary">{summary}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function PeriodField({ value }: { value: string }) {
  return (
    <Form className="period-form" method="get">
      <label>
        <span>UTC period</span>
        <input name="period" type="month" defaultValue={value} />
      </label>
      <button className="quiet-button" type="submit">
        Apply
      </button>
    </Form>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return <span className={`status-badge status-${normalized}`}>{value.replaceAll('_', ' ')}</span>;
}

function EmptySection({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-section">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function DataTable({
  children,
  columns,
  empty,
}: {
  children: React.ReactNode;
  columns: readonly DataTableColumn[];
  empty?: EmptyTableState;
}) {
  if (empty) return <EmptySection title={empty.title} message={empty.message} />;
  return (
    <div className="table-scroll">
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

export function Metric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function ControlSection({
  badge,
  children,
  copy,
  eyebrow,
  title,
}: {
  badge?: React.ReactNode;
  children: React.ReactNode;
  copy: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="control-section">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {badge}
      </div>
      <p className="control-copy">{copy}</p>
      {children}
    </section>
  );
}

export function Pagination({
  hasMore,
  limit,
  offset,
  total,
}: {
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}) {
  const location = useLocation();
  const previousOffset = Math.max(0, offset - limit);
  const rangeEnd = Math.min(total, offset + limit);
  const linkFor = (nextOffset: number) => {
    const params = new URLSearchParams(location.search);
    params.set('offset', String(nextOffset));
    params.set('limit', String(limit));
    return `${location.pathname}?${params.toString()}`;
  };
  return (
    <div className="pagination" aria-label="Pagination">
      <span>{total === 0 ? '0 results' : `${offset + 1}-${rangeEnd} of ${total}`}</span>
      <div>
        {offset > 0 ? (
          <Link className="quiet-button" to={linkFor(previousOffset)}>
            Previous
          </Link>
        ) : (
          <span className="quiet-button disabled">Previous</span>
        )}
        {hasMore ? (
          <Link className="quiet-button" to={linkFor(offset + limit)}>
            Next
          </Link>
        ) : (
          <span className="quiet-button disabled">Next</span>
        )}
      </div>
    </div>
  );
}

export function MutationNotice({ result }: { result: { ok: boolean; message: string; code?: string } | undefined }) {
  if (!result) return null;
  const view = mutationNoticeView(result);
  return (
    <div className={view.className} role={view.role}>
      <strong>{view.title}</strong>
      <span>{result.message}</span>
    </div>
  );
}

function mutationNoticeView(result: { ok: boolean; code?: string }) {
  if (result.ok) {
    return {
      className: 'mutation-notice success',
      role: 'status' as const,
      title: 'Change saved',
    };
  }
  if (result.code === 'admin_state_conflict') {
    return {
      className: 'mutation-notice error',
      role: 'alert' as const,
      title: 'Account changed elsewhere',
    };
  }
  return {
    className: 'mutation-notice error',
    role: 'alert' as const,
    title: 'Change not saved',
  };
}
