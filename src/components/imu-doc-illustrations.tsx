/**
 * The documentation's drawings (supplied art, IMU_v2, 2026-09-27): a bike
 * in the situation each figure describes, drawn on the popup's white where
 * the table's marks sat in grey tiles. Only the documentation wears them —
 * the table and the cards keep their small marks. Strokes ride
 * currentColor, so the dark theme keeps them visible.
 *
 * Lines at 2.404 units, not the art's 3.2 (by request, 2026-09-27): drawn
 * 104 px tall from a 100-unit box, that is 2.5 px on screen.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = { className?: string };

/** Harshness. */
export function HarshnessIllustration({ className }: Props) {
  // Unique per drawing: two on one page must not share a mask.
  const id = useId();
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      {/* The ground scrolls right to left while the mouse is over the
          concept (by request, 2026-09-27; `.harsh-ground` in globals.css),
          seen through a window that fades out at both ends. The art's
          zigzag has one period, 19.03 units a tooth, so it is drawn as one
          line a few teeth longer than the window on each side and slid by
          exactly one tooth a loop — the last frame is the first. At rest
          it lies where the art drew it. */}
      <defs>
        <linearGradient
          id={`${id}-fade`}
          x1="0"
          x2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.1" stopColor="#fff" />
          <stop offset="0.9" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask
          id={`${id}-ground`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="70"
          width="120"
          height="30"
        >
          <rect
            x="0"
            y="70"
            width="120"
            height="30"
            fill={`url(#${id}-fade)`}
          />
        </mask>
      </defs>
      <g mask={`url(#${id}-ground)`}>
        <path
          className="harsh-ground"
          d="M-35.544 92.9 L-26.031 78.72 L-16.517 92.9 L-7.004 78.72 L2.510 92.9 L12.023 78.72 L21.537 92.9 L31.050 78.72 L40.564 92.9 L50.077 78.72 L59.591 92.9 L69.104 78.72 L78.618 92.9 L88.131 78.72 L97.645 92.9 L107.158 78.72 L116.672 92.9 L126.185 78.72 L135.699 92.9 L145.212 78.72"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* The bike, wheels and frame as one (so the wheels stay round),
          trembling on the ground's small stuff and thrown up by the one
          hit that stands out — what the figure measures. */}
      <g className="harsh-ill-bike">
        <path
          d="M48.1792 67.2381C41.3897 67.2381 35.8857 61.7341 35.8857 54.9446C35.8857 48.1552 41.3897 42.6512 48.1792 42.6512C54.9687 42.6512 60.4727 48.1552 60.4727 54.9446C60.4727 61.7341 54.9687 67.2381 48.1792 67.2381Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M98.1606 67.2381C104.95 67.2381 110.454 61.7341 110.454 54.9446C110.454 48.1552 104.95 42.6512 98.1606 42.6512C91.3712 42.6512 85.8672 48.1552 85.8672 54.9446C85.8672 61.7341 91.3712 67.2381 98.1606 67.2381Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M98.1606 55.1918L85.8672 25.6254L92.0139 23.6619"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M70.5671 54.7544L60.9082 31.9684"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M70.5664 54.9446L88.0337 30.8362L70.5664 40.9651L70.9318 46.7139"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M70.567 54.9446H48.1797L65.5983 43.8463"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M56.3325 31.9177H67.835"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M109.275 31.9229L111.765 33.136L107.628 38.7732L109.275 31.9229Z"
        className="harsh-ill-spark harsh-ill-spark-front"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M111.092 42.1878L116.267 38.2236L117.324 40.9116L111.092 42.1878Z"
        className="harsh-ill-spark harsh-ill-spark-front"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M103.392 38.4358L103.326 31.9177L100.557 32.7413L103.392 38.4358Z"
        className="harsh-ill-spark harsh-ill-spark-front"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M76.8504 63.827L74.37 65.0588L72.4292 58.3412L76.8504 63.827Z"
        className="harsh-ill-spark harsh-ill-spark-front"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M67.6099 59.0014L67.5921 65.5199L64.8174 64.7171L67.6099 59.0014Z"
        className="harsh-ill-spark harsh-ill-spark-front"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M75.2817 55.1918L80.4858 59.1171L81.5231 56.4213L75.2817 55.1918Z"
        className="harsh-ill-spark harsh-ill-spark-front"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.8934 63.7606L25.6616 61.2802L32.3792 59.3394L26.8934 63.7606Z"
        className="harsh-ill-spark harsh-ill-spark-rear"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.7187 54.5203L25.2002 54.5025L26.003 51.7278L31.7187 54.5203Z"
        className="harsh-ill-spark harsh-ill-spark-rear"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35.5283 62.1918L31.603 67.3959L34.2989 68.4332L35.5283 62.1918Z"
        className="harsh-ill-spark harsh-ill-spark-rear"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.599172"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Chassis movement 2–12 Hz. Animated while the mouse is over it (globals.css, `chassis-ill-*`). */
export function ChassisIllustration({ className }: Props) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      <defs>
        <FadeMask
          id={`${id}-ground`}
          x={6.5}
          y={76}
          width={106.8}
          height={20}
        />
      </defs>
      {/* Long, slow swells — the 2–12 Hz band — rolling right to left. */}
      <g mask={`url(#${id}-ground)`}>
        <path
          className="chassis-ill-ground"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M-66.081 83.9217 L-63.226 88.404 C-60.592 92.5389 -56.282 92.5389 -53.648 88.404 L-50.792 83.9217 C-48.158 79.7868 -43.848 79.7868 -41.214 83.9217 L-38.359 88.404 C-35.725 92.5389 -31.415 92.5389 -28.78 88.404 L-25.925 83.9217 C-23.291 79.7868 -18.981 79.7868 -16.347 83.9217 L-13.492 88.404 C-10.858 92.5389 -6.547 92.5389 -3.913 88.404 L-1.058 83.9217 C1.576 79.7868 5.886 79.7868 8.52 83.9217 L11.375 88.404 C14.009 92.5389 18.32 92.5389 20.954 88.404 L23.809 83.9217 C26.443 79.7868 30.753 79.7868 33.387 83.9217 L36.243 88.404 C38.877 92.5389 43.187 92.5389 45.821 88.404 L48.676 83.9217 C51.31 79.7868 55.62 79.7868 58.254 83.9217 L61.11 88.404 C63.744 92.5389 68.054 92.5389 70.688 88.404 L73.543 83.9217 C76.177 79.7868 80.488 79.7868 83.121 83.9217 L85.977 88.404 C88.611 92.5389 92.921 92.5389 95.555 88.404 L98.41 83.9217 C101.044 79.7868 105.355 79.7868 107.988 83.9217 L110.844 88.404 C113.478 92.5389 117.788 92.5389 120.422 88.404 L123.277 83.9217 C125.911 79.7868 130.222 79.7868 132.856 83.9217 L135.711 88.404 C138.345 92.5389 142.655 92.5389 145.289 88.404 L148.145 83.9217 C150.779 79.7868 155.089 79.7868 157.723 83.9217"
        />
      </g>
      {/* The wheels hold the ground, still; the frame rides above them on
          its suspension — the slow heave the band measures (by request,
          2026-09-27: wheels and frame apart, the wheels fixed) — and the
          arrows open and close with it. */}
      <path
        d="M33.7188 55.3658C33.7188 62.1553 39.2227 67.6593 46.0122 67.6593C52.8017 67.6593 58.3057 62.1553 58.3057 55.3658C58.3057 48.5764 52.8017 43.0724 46.0122 43.0724C39.2227 43.0724 33.7188 48.5764 33.7188 55.3658Z"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeMiterlimit="10"
      />
      <path
        d="M95.9937 67.6593C102.783 67.6593 108.287 62.1553 108.287 55.3658C108.287 48.5764 102.783 43.0724 95.9937 43.0724C89.2042 43.0724 83.7002 48.5764 83.7002 55.3658C83.7002 62.1553 89.2042 67.6593 95.9937 67.6593Z"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeMiterlimit="10"
      />
      <g className="chassis-ill-frame">
        <path
          d="M95.9937 55.613L83.7002 26.0466L89.8469 24.0831"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M68.4001 55.1756L58.7412 32.3896"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M68.3999 55.3658L85.8672 31.2574L68.3999 41.3863L68.7653 47.1351"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M68.4 55.3658H46.0127L63.4313 44.2675"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M54.1655 32.3389H65.668"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* The art's two arrows each ran their shaft most of the way down
          the other's, and where they overlapped the line read thicker than
          the rest (2026-09-27): each shaft now stops at the middle. */}
      <g className="chassis-ill-arrow-up">
        <path
          d="M72.2397 8.8847V17.5626"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M67.334 12.8441L71.5251 8.65307C71.92 8.25814 72.5603 8.25814 72.9552 8.65307L77.1463 12.8441"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="chassis-ill-arrow-down">
        <path
          d="M72.2397 26.2404V17.5626"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M77.1463 22.2809L72.9552 26.472C72.5603 26.867 71.92 26.867 71.5251 26.472L67.334 22.281"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Chatter 12–60 Hz. Animated while the mouse is over it (globals.css, `chatter-ill-*`). */
export function ChatterIllustration({ className }: Props) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      <defs>
        {/* Both rows reach further back than the art drew them (by request,
            2026-09-27), so more ground trails behind the rear wheel. */}
        <FadeMask id={`${id}-top`} x={4} y={76} width={85} height={14} />
        <FadeMask id={`${id}-bottom`} x={18} y={85} width={85} height={14} />
      </defs>
      {/* Fine, fast teeth — the 12–60 Hz band — two rows at their own
          pace, right to left. */}
      <g mask={`url(#${id}-top)`}>
        <path
          className="chatter-ill-top"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M-8.622 79.37 L-1.773 86.02 L5.077 79.37 L11.927 86.02 L18.776 79.37 L25.626 86.02 L32.476 79.37 L39.326 86.02 L46.175 79.37 L53.025 86.02 L59.875 79.37 L66.724 86.02 L73.574 79.37 L80.424 86.02 L87.273 79.37 L94.123 86.02 L100.973 79.37 L107.823 86.02 L114.672 79.37 L121.522 86.02 L128.372 79.37 L135.221 86.02"
        />
      </g>
      <g mask={`url(#${id}-bottom)`}>
        <path
          className="chatter-ill-bottom"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M-15.472 95.49 L-8.623 88.8 L-1.773 95.49 L5.077 88.8 L11.926 95.49 L18.776 88.8 L25.626 95.49 L32.476 88.8 L39.325 95.49 L46.175 88.8 L53.025 95.49 L59.874 88.8 L66.724 95.49 L73.574 88.8 L80.423 95.49 L87.273 88.8 L94.123 95.49 L100.972 88.8 L107.822 95.49 L114.672 88.8 L121.522 95.49 L128.371 88.8 L135.221 95.49 L142.071 88.8"
        />
      </g>
      {/* The bike buzzes on it; the marks by the wheels flicker. */}
      <g className="chatter-ill-bike">
        <path
          d="M23.8291 54.2053C23.8291 60.9948 29.3331 66.4988 36.1226 66.4988C42.912 66.4988 48.416 60.9948 48.416 54.2053C48.416 47.4158 42.912 41.9119 36.1226 41.9119C29.3331 41.9119 23.8291 47.4158 23.8291 54.2053Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M86.104 66.4988C92.8935 66.4988 98.3975 60.9948 98.3975 54.2053C98.3975 47.4158 92.8935 41.9119 86.104 41.9119C79.3145 41.9119 73.8105 47.4158 73.8105 54.2053C73.8105 60.9948 79.3145 66.4988 86.104 66.4988Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M86.104 54.4525L73.8105 24.8861L79.9573 22.9226"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M58.5105 54.0151L48.8516 31.2291"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M58.5098 54.2053L75.9771 30.0969L58.5098 40.2258L58.8752 45.9745"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M58.5104 54.2053H36.123L53.5417 43.107"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M44.2759 31.1783H55.7784"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="chatter-ill-marks chatter-ill-marks-right">
        <path
          d="M74.7769 10.0994L80.422 10.1394L80.4961 15.7504L86.1071 15.8245L86.1813 21.4355L91.7064 21.5955L91.8323 27.1548"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M86.1899 4.37128L86.2641 9.98227L91.8751 10.0564L91.9492 15.6674L97.4744 15.8274"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="chatter-ill-marks chatter-ill-marks-left">
        <path
          d="M30.459 34.2714L30.499 28.6263L36.11 28.5521L36.1842 22.9411L41.7952 22.867L41.9552 17.3418L47.5144 17.2159"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24.7314 22.8582L30.3424 22.784L30.4166 17.173L36.0276 17.0989L36.1876 11.5737"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Residual oscillation. Animated while the mouse is over it (globals.css, `settle-ill-*`). */
export function SettleIllustration({ className }: Props) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 133 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      <defs>
        {/* Wider behind the rear wheel than the art drew it (by request,
            2026-09-27): the ground runs one loop further back to fill it. */}
        <FadeMask id={`${id}-ground`} x={5} y={74} width={100.5} height={23} />
      </defs>
      {/* The ground brings the one big bump and its dying ripples
          round again, right to left, once a loop. */}
      <g mask={`url(#${id}-ground)`}>
        <path
          className="settle-ill-ground"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M-57.292 93.2337 L-47.779 78.9764 L-38.265 93.0601 L-28.752 82.8844 L-19.238 93.0601 L-9.724 85.3473 L-0.211 93.2337 L23.082 93.2337 L32.596 78.9764 L42.109 93.0601 L51.623 82.8844 L61.136 93.0601 L70.65 85.3473 L80.163 93.2337 L103.457 93.2337 L112.97 78.9764 L122.484 93.0601 L131.998 82.8844 L141.511 93.0601 L151.024 85.3473 L160.538 93.2337 L183.832 93.2337 L193.345 78.9764 L202.858 93.0601 L212.372 82.8844 L221.886 93.0601 L231.399 85.3473 L240.913 93.2337"
        />
      </g>
      {/* The bike is thrown by the bump and keeps swinging, less each
          time; the side arcs flash with each swing and fade. */}
      <g className="settle-ill-bike">
        <path
          d="M28.1357 54.6878C28.1357 61.4773 33.6397 66.9813 40.4292 66.9813C47.2187 66.9813 52.7227 61.4773 52.7227 54.6878C52.7227 47.8983 47.2187 42.3943 40.4292 42.3943C33.6397 42.3943 28.1357 47.8983 28.1357 54.6878Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M90.4106 66.9813C97.2001 66.9813 102.704 61.4773 102.704 54.6878C102.704 47.8983 97.2001 42.3943 90.4106 42.3943C83.6212 42.3943 78.1172 47.8983 78.1172 54.6878C78.1172 61.4773 83.6212 66.9813 90.4106 66.9813Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M90.4106 54.935L78.1172 25.3686L84.2639 23.4051"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M62.8166 54.4976L53.1577 31.7117"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M62.8164 54.6878L80.2837 30.5794L62.8164 40.7082L63.1818 46.457"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M62.8165 54.6878H40.4292L57.8478 43.5895"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M48.5825 31.6608H60.085"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="settle-ill-arc settle-ill-arc-l1">
        <path
          d="M25.1634 45.2056C19.9421 45.2056 15.7095 49.4383 15.7095 54.6596C15.7095 59.8809 19.9422 64.1135 25.1634 64.1135"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
          strokeLinecap="round"
        />
      </g>
      <g className="settle-ill-arc settle-ill-arc-l2">
        <path
          d="M10.3651 49.4893C7.50964 49.4893 5.19482 51.8041 5.19482 54.6596C5.19482 57.5151 7.50964 59.8299 10.3651 59.8299"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
          strokeLinecap="round"
        />
      </g>
      <g className="settle-ill-arc settle-ill-arc-r1">
        <path
          d="M107.453 64.1135C112.675 64.1135 116.907 59.8808 116.907 54.6596C116.907 49.4383 112.675 45.2056 107.453 45.2056"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
          strokeLinecap="round"
        />
      </g>
      <g className="settle-ill-arc settle-ill-arc-r2">
        <path
          d="M122.252 59.8299C125.107 59.8299 127.422 57.5151 127.422 54.6596C127.422 51.804 125.107 49.4892 122.252 49.4892"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Impacts. Animated while the mouse is over it (globals.css, `impacts-ill-*`). */
export function ImpactsIllustration({ className }: Props) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      <defs>
        <FadeMask id={`${id}-ground`} x={12} y={64} width={84} height={26} />
      </defs>
      {/* Bumps coming, right to left: each one knocks the rear wheel,
          then the front — where the star bursts. */}
      <g mask={`url(#${id}-ground)`}>
        <path
          className="impacts-ill-ground"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.1 86.1563 L42.959 86.1563 L57.574 68.3038 L71.933 86.1563 L93.99 86.1563 L122.848 86.1563 L137.463 68.3038 L151.823 86.1563 L173.879 86.1563 L202.738 86.1563 L217.353 68.3038 L231.712 86.1563 L253.769 86.1563"
        />
      </g>
      <g className="impacts-ill-bike">
        <path
          d="M16.7603 56.173C16.7603 62.9625 22.2642 68.4664 29.0537 68.4664C35.8432 68.4664 41.3471 62.9625 41.3471 56.173C41.3471 49.3835 35.8432 43.8795 29.0537 43.8795C22.2642 43.8795 16.7603 49.3835 16.7603 56.173Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M69.8139 48.0427C67.9018 50.2097 66.7417 53.0558 66.7417 56.1729C66.7417 60.3886 68.8637 64.1086 72.0977 66.3233"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M72.4803 40.6552L66.7417 26.8537L72.8884 24.8903"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M51.4411 55.9828L41.7822 33.1968"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M51.4414 56.173L68.9087 32.0646L51.4414 42.1934L51.8068 47.9422"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M51.441 56.173H29.0537L46.4723 45.0746"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M37.207 33.146H48.7095"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g className="impacts-ill-star">
          <path
            d="M88.9167 38.1149L91.3749 48.9977L100.808 43.0407L94.8514 52.4742L105.734 54.9324L94.8514 57.3907L100.808 66.8242L91.3749 60.8672L88.9167 71.75L86.4584 60.8672L77.0249 66.8242L82.9819 57.3907L72.0991 54.9324L82.9819 52.4742L77.0249 43.0407L86.4584 48.9977L88.9167 38.1149Z"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

/** Moving speed. Animated while the mouse is over it (globals.css, `speed-ill-*`). */
export function SpeedIllustration({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      {/* The streaks and the road run back past the bike, each at its
          own pace; the bike rocks a little as it rolls. */}
      <path
        className="speed-ill-line speed-ill-line-1"
        d="M36.8345 86.3104H99.8623"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="speed-ill-line speed-ill-line-2"
        d="M19.9727 77.0446H70.8115"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="speed-ill-line speed-ill-line-3"
        d="M30.6128 19.1439H56.2859"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="speed-ill-line speed-ill-line-4"
        d="M26.1626 28.4351H38.5383"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="speed-ill-line speed-ill-line-5"
        d="M86.4116 33.6693H98.7873"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g className="speed-ill-bike">
        <path
          d="M24.541 55.4855C24.541 62.275 30.045 67.779 36.8345 67.779C43.624 67.779 49.1279 62.275 49.1279 55.4855C49.1279 48.696 43.624 43.1921 36.8345 43.1921C30.045 43.1921 24.541 48.696 24.541 55.4855Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M86.8154 67.779C93.6049 67.779 99.1089 62.275 99.1089 55.4855C99.1089 48.696 93.6049 43.1921 86.8154 43.1921C80.0259 43.1921 74.522 48.696 74.522 55.4855C74.522 62.275 80.0259 67.779 86.8154 67.779Z"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeMiterlimit="10"
        />
        <path
          d="M86.8154 55.7327L74.522 26.1663L80.6687 24.2028"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M59.2219 55.2953L49.563 32.5093"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M59.2217 55.4855L76.689 31.3771L59.2217 41.506L59.5871 47.2547"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M59.2217 55.4855H36.8345L54.2531 44.3872"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M44.9878 32.4586H56.4903"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Retention. Animated while the mouse is over it (globals.css, `retention-ill-*`). */
export function RetentionIllustration({ className }: Props) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      {/* The wheels are arrows turning: speed kept. Each spins about its
          own hub, steady, while the bike rolls on. */}
      <g className="retention-ill-bike">
        <path
          d="M84.9082 54.0022L72.6147 24.4358L78.7615 22.4723"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M57.3137 53.5647L47.6548 30.7788"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M57.314 53.755L74.7813 29.6466L57.314 39.7754L57.6794 45.5242"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M57.3135 53.7549H34.9263L52.3449 42.6566"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M43.0796 30.728H54.5821"
          stroke="currentColor"
          strokeWidth="2.404"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g className="retention-ill-wheel retention-ill-wheel-rear">
          <path
            d="M25.0674 44.5775C19.8623 49.7826 19.8623 58.2217 25.0674 63.4268C28.6078 66.9672 33.6444 68.0995 38.1418 66.8237"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M43.9166 63.4268C49.1217 58.2217 49.1217 49.7826 43.9166 44.5775C40.7762 41.4371 36.4586 40.1914 32.3843 40.8404"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20.9722 43.556H26.0888V48.6727"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M48.023 64.1852L42.9062 64.1852V59.0685"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g className="retention-ill-wheel retention-ill-wheel-front">
          <path
            d="M75.4834 63.4325C80.6885 68.6375 89.1276 68.6375 94.3327 63.4325C97.8731 59.8921 99.0054 54.8555 97.7296 50.358"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M94.3322 44.5831C89.1272 39.378 80.688 39.378 75.4829 44.5831C72.3425 47.7235 71.0968 52.0412 71.7458 56.1155"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M74.4614 67.5276V62.4109H79.5781"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M95.0908 40.4766V45.5933H89.9741"
            stroke="currentColor"
            strokeWidth="2.404"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <path
        className="retention-ill-ground"
        d="M19.9727 84.5798H99.8622"
        stroke="currentColor"
        strokeWidth="2.404"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* The dynamics' axes, drawn like the concepts (supplied art, IMU_v2,
 * 2026-09-27: abrsoção_n, control_2, support_2) — the same bike. The art's
 * 4-unit lines are drawn at STROKE, 2.5 px at the 1.173 px a unit they are
 * shown at in the documentation (the wheels as big as the concepts'). Each
 * keeps its axis card's loop, as `doc-*` keyframes in globals.css with the
 * travel scaled to these units. */
const STROKE = 2.13;

/** Absorção. */
export function AbsorptionAxisDrawing({ className }: Props) {
  return (
    <svg
      viewBox="0 0 85 82"
      fill="none"
      className={cn("h-auto overflow-visible", className)}
      aria-hidden
    >
      <g className="doc-absorb-arrow">
        <path
          d="M42.9092 24.74V2"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M55.1971 14.8233L44.7003 25.3201C43.7112 26.3092 42.1075 26.3092 41.1184 25.3201L30.6216 14.8233"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        className="doc-absorb-wheel"
        d="M22.5679 67.732C16.5419 67.732 11.6567 62.8469 11.6567 56.8208C11.6567 50.7947 16.5419 45.9096 22.5679 45.9096C28.594 45.9096 33.4792 50.7947 33.4792 56.8208C33.4792 62.8469 28.594 67.732 22.5679 67.732Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeMiterlimit="10"
      />
      <path
        className="doc-absorb-wheel"
        d="M66.9298 67.732C72.9559 67.732 77.841 62.8469 77.841 56.8208C77.841 50.7947 72.9559 45.9096 66.9298 45.9096C60.9037 45.9096 56.0186 50.7947 56.0186 56.8208C56.0186 62.8469 60.9037 67.732 66.9298 67.732Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeMiterlimit="10"
      />
      <g className="doc-absorb-frame">
        <path
          d="M66.9298 57.0402L56.0186 30.7981L61.4742 29.0555"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M42.4381 56.652L33.8652 36.428"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M42.438 56.8208L57.9413 35.4231L42.438 44.4131L42.7623 49.5154"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M42.438 56.8208H22.5679L38.028 46.9703"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M29.8042 36.3829H40.0134"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M2 79.811H82.7282"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Controlo. */
export function ControlAxisDrawing({ className }: Props) {
  return (
    <svg
      viewBox="0 0 71 97"
      fill="none"
      className={cn("h-auto overflow-visible", className)}
      aria-hidden
    >
      <g className="doc-ctrl-arrow-down">
        <path
          d="M35.9922 92.7509V70.0109"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M48.2801 82.8343L37.7833 93.3311C36.7942 94.3202 35.1905 94.3202 34.2014 93.3311L23.7046 82.8343"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="doc-ctrl-arrow-up">
        <path
          d="M35.9922 3.32198L35.9922 26.062"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M23.7046 13.2386L34.2014 2.74183C35.1905 1.75272 36.7942 1.75272 37.7833 2.74183L48.2801 13.2386"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="doc-ctrl-bike">
        <path
          d="M2 53.4977C2 59.5238 6.88512 64.4089 12.9112 64.4089C18.9373 64.4089 23.8224 59.5238 23.8224 53.4977C23.8224 47.4716 18.9373 42.5865 12.9112 42.5865C6.88512 42.5865 2 47.4716 2 53.4977Z"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeMiterlimit="10"
        />
        <path
          d="M57.273 64.4089C63.2991 64.4089 68.1842 59.5238 68.1842 53.4977C68.1842 47.4716 63.2991 42.5865 57.273 42.5865C51.2469 42.5865 46.3618 47.4716 46.3618 53.4977C46.3618 59.5238 51.2469 64.4089 57.273 64.4089Z"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeMiterlimit="10"
        />
        <path
          d="M57.273 53.7171L46.3618 27.4751L51.8174 25.7324"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32.7814 53.3289L24.2085 33.105"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32.7812 53.4977L48.2845 32.1L32.7812 41.09L33.1056 46.1924"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32.7813 53.4977H12.9111L28.3712 43.6473"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.1475 33.0599H30.3566"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Suporte. */
export function SupportAxisDrawing({ className }: Props) {
  return (
    <svg
      viewBox="0 0 88 79"
      fill="none"
      className={cn("h-auto overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M2 65.7745C2 71.8006 6.88513 76.6857 12.9112 76.6857C18.9373 76.6857 23.8224 71.8006 23.8224 65.7745C23.8224 59.7484 18.9373 54.8633 12.9112 54.8633C6.88513 54.8633 2 59.7484 2 65.7745Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeMiterlimit="10"
      />
      <path
        d="M57.273 76.6857C63.2991 76.6857 68.1842 71.8006 68.1842 65.7745C68.1842 59.7484 63.2991 54.8633 57.273 54.8633C51.2469 54.8633 46.3618 59.7484 46.3618 65.7745C46.3618 71.8006 51.2469 76.6857 57.273 76.6857Z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeMiterlimit="10"
      />
      <g className="doc-sup-frame">
        <path
          d="M57.273 65.9939L46.3618 39.7519L51.8174 38.0092"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32.7814 65.6057L24.2085 45.3818"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32.7812 65.7745L48.2845 44.3768L32.7812 53.3668L33.1056 58.4692"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32.7813 65.7745H12.9111L28.3712 55.924"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.1475 45.3366H30.3566"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="doc-sup-arrow">
        <path
          d="M73.1724 3.32199V26.062"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M60.8848 13.2386L71.3816 2.74183C72.3707 1.75272 73.9744 1.75272 74.9635 2.74183L85.4603 13.2386"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M63.1807 34.6474H83.1639"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** RMS (supplied art, IMU_v2/rms.svg, 2026-09-27): the trace alone, set
 * inside a margin (the viewBox is the art's 100 × 90 widened to 120 × 114)
 * so at the drawings' 104 px it stands no taller than their bikes; lines at
 * 2.5 px, 2.74 units at that scale. It keeps the old mark's loop — the
 * trace dims and a pulse sweeps it (`rms-base`, `rms-sweep`) — and so runs
 * right to left, as that loop's dash expects: the art's path, reversed. */
export function RmsIllustration({ className }: Props) {
  const d =
    "M97.6693 44.8121H78.9568L62.5124 87.9077L36.9953 2L22.252 44.8121H2";
  return (
    <svg
      viewBox="-10 -12 120 114"
      fill="none"
      className={cn("h-auto", className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth={2.74}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path className="rms-base" d={d} />
        <path className="rms-sweep" pathLength={1} d={d} />
      </g>
    </svg>
  );
}

/** A window that fades out at both ends, for a ground that scrolls
 * through it: the teeth come in and leave softly instead of being cut at
 * the edge. In user units; `id` must be unique on the page. */
function FadeMask({
  id,
  x,
  y,
  width,
  height,
}: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <>
      <linearGradient
        id={`${id}-fade`}
        x1={x}
        x2={x + width}
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.1" stopColor="#fff" />
        <stop offset="0.9" stopColor="#fff" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask
        id={id}
        maskUnits="userSpaceOnUse"
        x={x}
        y={y}
        width={width}
        height={height}
      >
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={`url(#${id}-fade)`}
        />
      </mask>
    </>
  );
}
