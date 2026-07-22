import { Button, Field, Input } from '@artifact/ui';
import { Form } from 'react-router';

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
      <Field label="UTC period">
        <Input name="period" type="month" defaultValue={value} />
      </Field>
      <Button variant="quiet" type="submit">
        Apply
      </Button>
    </Form>
  );
}
