// Central URL builders so every page has a stable, refresh-safe slash route.
const enc = encodeURIComponent;

export const paths = {
  home: () => '/',
  settings: () => '/settings',
  server: (sid: string) => `/server/${enc(sid)}`,
  folder: (sid: string, folder: string) => `/folder/${enc(sid)}/${enc(folder)}`,
  item: (sid: string, folder: string, title: string) => `/item/${enc(sid)}/${enc(folder)}/${enc(title)}`,
  season: (sid: string, folder: string, title: string, season: string) =>
    `/item/${enc(sid)}/${enc(folder)}/${enc(title)}/season/${enc(season)}`,
  play: (title: string, src: string, poster?: string) =>
    `/play?src=${enc(src)}&title=${enc(title)}${poster ? `&poster=${enc(poster)}` : ''}`,
  collections: () => '/collections',
  collection: (name: string) => `/collection/${enc(name)}`,
};
