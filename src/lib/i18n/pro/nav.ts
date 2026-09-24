/**
 * Pro dictionary, namespace `nav` (2026-09-24): the shell around the
 * pages — the rail and the phone bar's entries, the rail's collapse
 * switch, and the three boundary screens the shell shows in a page's
 * place (error, not found). The pages themselves live in their own
 * namespaces.
 */
const en = {
  /** The rail's and the phone bar's entries, in their order. */
  sessions: "Sessions",
  bikes: "Bikes",
  settings: "Settings",
  /** The `aria-label` of the phone bar's `<nav>`. */
  primary: "Primary",
  /** The rail's collapse switch: the word beside the icon when the rail is
   * open, and the hover titles of the two states. */
  collapse: "Collapse",
  collapseMenu: "Collapse menu",
  expandMenu: "Expand menu",
  /** The error boundary, in a page's place. */
  error: {
    title: "Something went wrong",
    body: "That request didn't go through. Try again — if it keeps happening, come back later.",
    retry: "Try again",
  },
  /** The not-found screen: the same words as the app's, but pointing home
   * at the sessions instead of the dashboard. */
  notFound: {
    title: "Page not found",
    body: "This session, bike or entry doesn't exist — it may have been deleted, or the link might be wrong.",
    back: "Back to sessions",
  },
};

const pt: typeof en = {
  sessions: "Sessões",
  bikes: "Bicicletas",
  settings: "Definições",
  primary: "Principal",
  collapse: "Recolher",
  collapseMenu: "Recolher menu",
  expandMenu: "Expandir menu",
  error: {
    title: "Algo correu mal",
    body: "O pedido não chegou ao fim. Tenta outra vez — se continuar a acontecer, volta mais tarde.",
    retry: "Tentar outra vez",
  },
  notFound: {
    title: "Página não encontrada",
    body: "Esta sessão, bicicleta ou registo não existe — pode ter sido apagado, ou a ligação pode estar errada.",
    back: "Voltar às sessões",
  },
};

export const nav = { en, pt };
