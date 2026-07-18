import type { ReactNode } from 'react';
import { Button, ButtonLink, IconButton } from './commands';
import type { CommandFoundationSpecimenId } from './foundation-command-specimens';

export function FoundationCommandMatrix() {
  return (
    <div
      id="foundation-command-matrix"
      className="ui-foundation-matrix"
      data-foundation-section="commands"
      aria-label="UI Foundation command matrix"
    >
      <CommandSpecimen id="button-primary" label="Button / primary">
        <Button variant="primary">Create</Button>
      </CommandSpecimen>
      <CommandSpecimen id="button-secondary" label="Button / secondary">
        <Button>Open</Button>
      </CommandSpecimen>
      <CommandSpecimen id="button-quiet" label="Button / quiet">
        <Button variant="quiet">Cancel</Button>
      </CommandSpecimen>
      <CommandSpecimen id="button-danger" label="Button / danger">
        <Button variant="danger">Delete</Button>
      </CommandSpecimen>
      <CommandSpecimen id="button-disabled" label="Button / disabled">
        <Button disabled>Unavailable</Button>
      </CommandSpecimen>
      <CommandSpecimen id="button-link-primary" label="ButtonLink / primary">
        <ButtonLink href="#foundation-command-matrix" variant="primary">
          View commands
        </ButtonLink>
      </CommandSpecimen>
      <CommandSpecimen id="button-link-disabled" label="ButtonLink / disabled">
        <ButtonLink href="#foundation-command-matrix" disabled>
          Locked link
        </ButtonLink>
      </CommandSpecimen>
      <CommandSpecimen id="icon-button-default" label="IconButton / default">
        <IconButton icon="⌕" label="Preview command specimen" />
      </CommandSpecimen>
      <CommandSpecimen id="icon-button-primary" label="IconButton / primary">
        <IconButton icon="+" label="Add command specimen" variant="primary" />
      </CommandSpecimen>
      <CommandSpecimen id="icon-button-danger" label="IconButton / danger">
        <IconButton icon="×" label="Delete command specimen" variant="danger" />
      </CommandSpecimen>
      <CommandSpecimen id="icon-button-disabled" label="IconButton / disabled">
        <IconButton disabled icon="−" label="Disabled command specimen" />
      </CommandSpecimen>
    </div>
  );
}

function CommandSpecimen({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: CommandFoundationSpecimenId;
  label: string;
}) {
  return (
    <div className="ui-foundation-specimen" data-foundation-specimen={id}>
      <span className="ui-foundation-specimen__label">{label}</span>
      <div className="ui-foundation-specimen__control">{children}</div>
    </div>
  );
}
