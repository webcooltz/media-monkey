import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Back handler that returns to wherever the user actually came from (a collection,
 * search result, season…). Falls back to `fallback` when the page was opened
 * directly (no in-app history), e.g. from a bookmark or a refresh.
 */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key !== 'default' ? navigate(-1) : navigate(fallback));
}
