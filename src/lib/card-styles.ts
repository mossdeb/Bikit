/**
 * Hover surface shared by every clickable card and list row on a card.
 *
 * The light-mode value is a fixed hex rather than a token: it's a hair darker
 * than the white card, and the muted token at any opacity either vanished or
 * went too far. Dark mode keeps the token tint — #F7F7F7 there would turn the
 * card white.
 */
export const CLICKABLE_CARD_HOVER = "transition-colors hover:bg-[#F7F7F7] dark:hover:bg-muted/50";

/**
 * A hairline around a card surface, in the dark theme only.
 *
 * **Why only dark.** The two surfaces are almost the same colour there:
 * `--card` #1d1f23 on `--background` #17181b measures **1.076:1**, which is
 * an edge you infer rather than see. The light theme does not need it —
 * white on #efefef reads on its own — and drawing it there would put a line
 * around every card in the app for no gain.
 *
 * **Why a ring and not a border.** A border is part of the box: on
 * `box-sizing: border-box` it eats a pixel of padding, and these cards carry
 * measured paddings and heights (the reading card's 248px floor among them).
 * A ring is a box-shadow — it paints, follows the radius, and costs no
 * layout at all. `ring-inset` keeps it inside the card's own edge so
 * neighbouring cards cannot overlap each other by a pixel.
 *
 * Using `--border`, the same token every divider uses, at 60% of its own
 * opacity — the full token read as a drawn outline once it was on every card
 * in the app rather than on five. The `/60` multiplies the token's own alpha
 * rather than replacing it, so this stays tied to the theme instead of
 * becoming a second hardcoded colour.
 */
export const DARK_CARD_HAIRLINE =
  "dark:ring-1 dark:ring-inset dark:ring-border/60";

/**
 * The same hairline for a surface that only becomes a card from `sm` up —
 * below that it is a transparent section inside one big card, and a ring
 * there would draw a box around nothing. Kept as its own constant because a
 * multi-class string cannot be breakpoint-prefixed after the fact.
 */
export const DARK_CARD_HAIRLINE_SM =
  "sm:dark:ring-1 sm:dark:ring-inset sm:dark:ring-border/60";
