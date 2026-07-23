import { InlineNotice, Skeleton } from '@artifact/ui';
import { Link } from 'react-router';

import { LogoGlyph } from '../LogoGlyph';
import { ActionButton, ActionLink } from '../ui/ActionButton';
import { Badge } from '../ui/Badge';
import { SearchField } from '../ui/SearchField';

const surfaceClassName = (name: string) => `product-pattern-specimen product-pattern-specimen--${name}`;

export function ProductSurfaceSpecimens() {
  return (
    <div className="product-pattern-inventory" data-product-surface-inventory>
      <ProductPatternSpecimen name="public-shell" label="Public shell">
        <div className="product-pattern-nav">
          <span className="product-pattern-nav__brand">
            <LogoGlyph />
            Artifact
          </span>
          <span>Docs</span>
          <ActionLink to="/app?new=blank" variant="primary" size="compact">
            Open editor
          </ActionLink>
        </div>
        <div className="product-pattern-account-states" aria-label="Account navigation states">
          <ActionButton data-account-state="anonymous" size="compact">
            Sign in
          </ActionButton>
          <ActionButton data-account-state="loading" disabled size="compact">
            Account
          </ActionButton>
          <ActionButton data-account-state="authenticated" size="compact">
            Sign out
          </ActionButton>
        </div>
      </ProductPatternSpecimen>

      <ProductPatternSpecimen name="route-recovery" label="Route recovery">
        <div className="product-pattern-state">
          <Badge variant="warning">Not found</Badge>
          <strong>Page not found.</strong>
          <span>Return to a known surface or open a blank canvas.</span>
          <ActionLink to="/" size="compact">
            Return home
          </ActionLink>
        </div>
      </ProductPatternSpecimen>

      <ProductPatternSpecimen name="artwork-frame" label="Artwork frame">
        <div className="product-pattern-artwork">
          <div className="product-pattern-artwork__image" aria-label="Cover preview" role="img" />
          <div>
            <strong>Offset signal</strong>
            <span>Editable example</span>
          </div>
        </div>
      </ProductPatternSpecimen>

      <ProductPatternSpecimen name="project-library" label="Project library">
        <div className="product-pattern-library">
          <div className="product-pattern-library__preview" />
          <div>
            <Badge variant="success">Synced</Badge>
            <strong>Night transit</strong>
            <span>Saved in this browser</span>
          </div>
          <ActionButton size="compact">Open</ActionButton>
        </div>
      </ProductPatternSpecimen>

      <ProductPatternSpecimen name="docs-navigation" label="Docs navigation">
        <nav className="product-pattern-docs-nav" aria-label="Docs specimen navigation">
          <Link aria-current="page" to="/docs">
            Overview
          </Link>
          <Link to="/docs/recipes">Recipes</Link>
          <Link to="/docs/reference">Reference</Link>
        </nav>
      </ProductPatternSpecimen>

      <ProductPatternSpecimen name="docs-reference" label="Docs reference">
        <div className="product-pattern-reference">
          <SearchField aria-label="Search reference specimen" value="grain" readOnly onClear={() => {}} />
          <Link to="/docs/reference/noise">
            <span>Source</span>
            <strong>Noise</strong>
          </Link>
          <Link to="/docs/reference/grain">
            <span>Effect</span>
            <strong>Grain</strong>
          </Link>
        </div>
      </ProductPatternSpecimen>

      <ProductPatternSpecimen name="docs-learning" label="Docs learning">
        <div className="product-pattern-learning">
          <div className="product-pattern-learning__filters">
            <ActionButton size="compact" variant="primary">
              All
            </ActionButton>
            <ActionButton size="compact" variant="quiet">
              Effects
            </ActionButton>
          </div>
          <InlineNotice>Choose a starting point, then open the editable document.</InlineNotice>
          <Skeleton shape="line" />
        </div>
      </ProductPatternSpecimen>
    </div>
  );
}

function ProductPatternSpecimen({ children, label, name }: { children: React.ReactNode; label: string; name: string }) {
  return (
    <article className={surfaceClassName(name)} data-product-specimen={name}>
      <p className="product-pattern-specimen__label">{label}</p>
      <div className="product-pattern-specimen__body">{children}</div>
    </article>
  );
}
