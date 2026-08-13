/** Form routes that take over the whole screen on mobile: the bottom nav is
 * hidden and the form card stretches to fill the viewport, with its buttons
 * pinned to the bottom. Desktop is unaffected. */
const FULLSCREEN_FORM_ROUTES = [
  /^\/bikes\/new$/,
  // A Configuração Inteligente é o mesmo tipo de ecrã: um fluxo com os seus
  // próprios botões no fim, onde a nav flutuante só tapava o "Voltar" e
  // deixava 96px de folga reservados para uma barra que não devia lá estar.
  /^\/bikes\/new\/ai$/,
  /^\/bikes\/[^/]+\/edit$/,
  /^\/bikes\/[^/]+\/components\/new$/,
  /^\/bikes\/[^/]+\/components\/[^/]+\/edit$/,
  /^\/bikes\/[^/]+\/components\/[^/]+\/interventions\/new$/,
  /^\/bikes\/[^/]+\/components\/[^/]+\/interventions\/[^/]+\/edit$/,
];

export function isFullscreenFormRoute(pathname: string) {
  return FULLSCREEN_FORM_ROUTES.some((re) => re.test(pathname));
}
