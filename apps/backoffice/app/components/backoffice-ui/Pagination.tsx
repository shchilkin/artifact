import { Button, ButtonLink } from '@artifact/ui';
import { useLocation } from 'react-router';

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
          <ButtonLink variant="quiet" to={linkFor(previousOffset)}>
            Previous
          </ButtonLink>
        ) : (
          <Button disabled variant="quiet">
            Previous
          </Button>
        )}
        {hasMore ? (
          <ButtonLink variant="quiet" to={linkFor(offset + limit)}>
            Next
          </ButtonLink>
        ) : (
          <Button disabled variant="quiet">
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
