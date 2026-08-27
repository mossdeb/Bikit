import { cn } from "@/lib/utils";
import { BikitLockup } from "@/components/logo";

/**
 * The IMU chart glyph (supplied art) — the analysis header's mark. Strokes
 * ride currentColor so the dark theme keeps it visible; the source SVG's
 * hardcoded black stays behind in the asset file.
 */
export function ImuChartGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden="true"
    >
      <path
        d="M24.6319 0.573166H5.36813C2.71995 0.573166 0.573181 2.71994 0.573181 5.36811V24.6319C0.573181 27.2801 2.71995 29.4268 5.36813 29.4268H24.6319C27.2801 29.4268 29.4269 27.2801 29.4269 24.6319V5.36811C29.4269 2.71994 27.2801 0.573166 24.6319 0.573166Z"
        stroke="currentColor"
        strokeWidth="1.14633"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M5.78351 21.7218L9.16591 7.85075C9.44225 6.71751 10.5339 6.77793 10.7528 7.93859L13.1085 22.0615C13.3354 23.2643 14.4812 23.2695 14.713 22.0686L17.0235 8.4642C17.2558 7.26003 18.406 7.26977 18.6291 8.4778L21.0532 21.6023C21.2537 22.6877 22.2451 22.8461 22.5962 21.8488L24.2882 15"
        stroke="currentColor"
        strokeWidth="1.14633"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M0.790344 14.5842H1.36351"
        stroke="currentColor"
        strokeWidth="1.14633"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M4.8905 14.5842H26.6396"
        stroke="currentColor"
        strokeWidth="1.14633"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeDasharray="1.18 3.53"
      />
      <path
        d="M28.4032 14.5842H28.9764"
        stroke="currentColor"
        strokeWidth="1.14633"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M24.2882 15.5689C24.832 15.5689 25.2728 15.128 25.2728 14.5842C25.2728 14.0404 24.832 13.5996 24.2882 13.5996C23.7444 13.5996 23.3035 14.0404 23.3035 14.5842C23.3035 15.128 23.7444 15.5689 24.2882 15.5689Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.14633"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The session's mark: a document with a trace inside (supplied art,
 * metrics_doc). A page and not a chart, because what it badges is the
 * recording itself — the chart glyph above belongs to the reading of it.
 * Strokes ride currentColor, so the dark theme keeps it visible.
 */
export function ImuDocGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 35"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M26.4002 7.01763L20.8423 1.56827C20.1574 0.896775 19.2286 0.519531 18.26 0.519531H4.18172C2.16481 0.519531 0.529785 2.12263 0.529785 4.10015V30.8997C0.529785 32.8772 2.16481 34.4803 4.18172 34.4803H23.8179C25.8348 34.4803 27.4698 32.8772 27.4698 30.8997V9.54951C27.4698 8.59987 27.0851 7.68913 26.4002 7.01763Z"
        stroke="currentColor"
        strokeWidth="1.31547"
        strokeMiterlimit="10"
      />
      <path
        d="M4.18164 19.2503H7.07247L9.14126 15.7498L11.0446 21.6198L14.1367 10.499L18.2026 24.501L20.4783 19.2503H23.8178"
        stroke="currentColor"
        strokeWidth="1.31547"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The "Bikit PRO" lockup the IMU lab wears.
 *
 * The drawing lives in `logo.tsx` with the regular lockup and the mark,
 * because the three ARE one drawing — this is that one with the chip. The
 * name stays because the lab is where it is worn and every call site says
 * so; what it must never be again is a second copy of the art.
 */
export function ImuProLogo({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return <BikitLockup pro className={className} onDark={onDark} />;
}
/**
 * The rider glyph (supplied art) — the mark on the dashboard's title, where
 * the panel is named after whoever rode the recording. Like its siblings
 * here, the source file's hardcoded black is left behind: the ink rides
 * `currentColor` so the dark theme keeps it.
 *
 * `solid` paints the silhouette instead of tracing it. The art is a single
 * closed contour, so a fill needs no second path — and with no stroke there
 * is no width to pin back through the viewBox ratio, which is the arithmetic
 * every other glyph here has to carry.
 */
export function ImuRiderGlyph({
  className,
  solid = false,
}: {
  className?: string;
  solid?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 25 24"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden="true"
    >
      <path
        fill={solid ? "currentColor" : undefined}
        stroke={solid ? undefined : "currentColor"}
        d="M18.0071 3.08015C17.981 3.11929 17.9665 3.13481 17.9612 3.14009C17.2771 3.5345 16.5938 3.93139 15.9113 4.32644L15.9077 4.32822C15.3414 4.66259 14.7751 4.99709 14.2088 5.33148L13.447 5.78159L14.2249 6.20236C14.7815 6.50328 15.3053 6.85717 15.8018 7.25714C16.0863 7.48638 16.3578 7.72796 16.614 7.98326C16.3416 8.14428 16.0691 8.2968 15.7805 8.46193L15.7759 8.46392C14.8368 9.01326 13.8988 9.56332 12.9597 10.1114C12.8532 10.1735 12.6821 10.2707 12.5353 10.4213L12.5223 10.4351L12.5103 10.4487C12.2478 10.7615 12.2096 11.1165 12.2427 11.4212C12.338 12.2987 12.4321 13.1735 12.5171 14.0487C12.5538 14.4266 12.7019 14.8261 13.1255 15.0839L13.1934 15.1251L13.2701 15.1424C13.4255 15.1795 13.6312 15.23 13.854 15.2405C14.2439 15.2591 14.6295 15.288 15.0311 15.3138C15.0425 15.3146 15.1269 15.3204 15.1579 15.3223C16.674 15.4165 18.1885 15.5084 19.7025 15.6071C19.9898 15.6258 20.3962 15.5886 20.6815 15.1958L20.7223 15.14L20.7462 15.0748C20.8303 14.8462 20.9116 14.6217 20.9948 14.3973C21.2385 14.8245 21.4862 15.2489 21.7323 15.6682L21.7333 15.668C21.7392 15.6782 21.742 15.6859 21.7442 15.6907C21.6853 16.7621 21.6308 17.8275 21.5693 18.8954C21.3883 18.9007 21.2125 18.9009 21.0155 18.9036L20.7455 18.9073L20.6002 19.1357C20.4851 19.3169 20.3865 19.4779 20.2775 19.6424C20.0975 19.914 19.8635 20.0441 19.5473 20.0537C19.2405 20.063 18.9587 20.0385 18.5972 20.0271L18.5882 20.027L18.3556 20.0235C14.6831 19.9251 11.0105 19.8267 7.33806 19.7275C7.00452 19.7184 6.81368 19.6499 6.68863 19.5576C6.56392 19.4655 6.44365 19.3049 6.33924 18.9929L6.22849 18.6622L5.88143 18.6516L5.36439 18.6359C5.3547 18.6358 5.34776 18.6341 5.34289 18.6336C5.33975 18.6293 5.33481 18.6232 5.32975 18.6144C4.45374 17.1018 3.57262 15.5916 2.69427 14.082C2.61777 13.9505 2.59096 13.8776 2.5852 13.8188L2.57673 13.7338L2.54099 13.6566C2.48826 13.5438 2.47895 13.4047 2.50523 13.1557C2.54186 12.8288 2.70868 12.5476 2.94531 12.1398L2.95 12.1338L2.95352 12.1271C3.35374 11.3868 3.74933 10.6492 4.15096 9.91356C4.43863 9.38657 4.59721 8.97923 4.88405 8.61327C5.51932 7.80284 6.28945 7.11393 7.15915 6.53064C7.36289 6.40307 7.7092 6.19928 8.01947 6.01916C8.1756 5.92852 8.32035 5.84467 8.43068 5.78202L8.6053 5.68417C9.15741 5.4249 9.71352 5.17182 10.2717 4.91781C11.017 4.57866 11.7769 4.23819 12.526 3.89495C13.2663 3.55565 14.0384 3.19224 14.7725 2.8548C15.7136 2.42224 16.6562 1.99396 17.5999 1.56267L17.6044 1.56068L18.9028 0.954135C19.159 0.837297 19.4014 0.728556 19.6444 0.632307C19.0988 1.44702 18.5522 2.26356 18.0071 3.08015Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
