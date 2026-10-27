import { useEffect } from 'react';

export const APP_NAME = 'Media Monkey';

/** Sets the browser tab title to "<title> · Media Monkey" while mounted. */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => { document.title = APP_NAME; };
  }, [title]);
}
