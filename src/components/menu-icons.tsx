export function MenuDashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28.1 28.1" className={className} fill="currentColor" aria-hidden="true">
      <path d="M15.3,8.2c0-1.5,0-3,0-4.4,0-1.6,1.1-2.7,2.7-2.7.5,0,1,0,1.5,0,1,.1,2.1.2,3.1.4,2.2.5,3.5,2,4,4.2.3,1.3.4,2.5.4,3.8,0,1,0,2.1,0,3.1,0,1.6-1.1,2.7-2.7,2.7-2.1,0-4.2,0-6.3,0-1.6,0-2.7-1.1-2.7-2.7,0-1.5,0-3,0-4.4Z" />
      <path d="M12.8,19.9c0,1.5,0,3,0,4.4,0,1.6-1.1,2.7-2.7,2.7-.5,0-1,0-1.5,0-1.2,0-2.4-.2-3.5-.6-1.9-.6-3-2-3.5-3.9-.3-1.3-.4-2.7-.4-4,0-1,0-2.1,0-3.1,0-1.6,1.1-2.7,2.7-2.7,2.1,0,4.2,0,6.3,0,1.6,0,2.7,1.1,2.7,2.7,0,1.5,0,3,0,4.5Z" />
      <path d="M6.9,10.2c-1.1,0-2.1,0-3.2,0-1.6,0-2.8-1.3-2.5-2.9.1-.9.3-1.7.6-2.6.7-1.7,2-2.8,3.7-3.2,1.6-.4,3.3-.5,5-.4,1.1,0,2.2,1,2.2,2.2,0,1.5,0,3.1,0,4.6,0,1.3-1.2,2.2-2.5,2.3-1.1,0-2.2,0-3.3,0h0Z" />
      <path d="M21.2,18c1.1,0,2.2,0,3.3,0,1.2,0,2.3.9,2.4,2.1,0,.6,0,1.2-.2,1.7-.2,1.3-.6,2.4-1.6,3.4-1,1-2.2,1.5-3.5,1.6-1.3.2-2.5.2-3.8.3-1.4,0-2.5-1-2.6-2.3,0-1.5,0-3,0-4.5,0-1.3,1.2-2.2,2.5-2.3,1.1,0,2.2,0,3.3,0Z" />
    </svg>
  );
}

export function MenuBikesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 37 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M28.9,9.2c-.6,0-1.1,0-1.6.2l-2.9-7.5c-.4-1.1-1.5-1.9-2.7-1.9h-3.5v2h3.5c.4,0,.7.2.9.6l2.6,6.6h-8.6l-.9-2.4h2.5v-2h-7.7v2h3l3.3,8.7h-2.1c-.5-3.6-3.6-6.4-7.3-6.4S0,12.6,0,16.6s3.3,7.4,7.4,7.4,6.8-2.8,7.3-6.4h6.9c.5,3.6,3.6,6.4,7.3,6.4s7.4-3.3,7.4-7.4-3.3-7.4-7.4-7.4ZM17.2,11.2h6.6c-1.2,1.1-2,2.7-2.3,4.4h-2.7l-1.7-4.4ZM7.4,22c-3,0-5.4-2.4-5.4-5.4s2.4-5.4,5.4-5.4,4.8,1.9,5.3,4.4h-5.3v2h5.3c-.5,2.5-2.6,4.4-5.3,4.4ZM28.9,22c-3,0-5.4-2.4-5.4-5.4s1-3.6,2.6-4.6l1.8,4.7,1.9-.7-1.8-4.7c.3,0,.6,0,.9,0,3,0,5.4,2.4,5.4,5.4s-2.4,5.4-5.4,5.4Z" />
    </svg>
  );
}

export function MenuSettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 26.6" className={className} fill="currentColor" aria-hidden="true">
      <path d="M22.1,21l-8.4,4.9c-1,.6-2.3.6-3.3,0L1.9,21c-1-.6-1.6-1.7-1.6-2.8v-9.7c0-1.2.6-2.3,1.6-2.8L10.4.8c1-.6,2.3-.6,3.3,0l8.4,4.9c1,.6,1.6,1.7,1.6,2.8v9.7c0,1.2-.6,2.3-1.6,2.8ZM12,8.3c-2.8,0-5,2.2-5,5s2.2,5,5,5,5-2.2,5-5-2.2-5-5-5Z" />
    </svg>
  );
}


/** Auto Stop (2026-11-09), from assets/icons/settings/auto stop.svg: a
 *  power button inside a cycle — the Logger's Auto Stop row. */
export function AutoStopIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87 88"
      // The art's 4-unit line is barely a pixel at 28 px; 6 matches the
      // title's semibold weight. overflow-visible keeps the thicker line's
      // outer edge, which now reaches past the viewBox.
      className={`overflow-visible ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.0494 72.8561C30.1156 88.9222 56.164 88.9222 72.2302 72.8561C83.1581 61.9282 86.653 46.3821 82.7151 32.5002" />
      <path d="M72.2303 14.6753C56.1641 -1.39087 30.1157 -1.39087 14.0495 14.6753C4.35626 24.3685 0.511265 37.6954 2.51453 50.2714" />
      <path d="M10.8964 85.4963V69.703H26.6897" />
      <path d="M74.5709 2V17.7933H58.7776" />
      <path d="M33.0473 30.4586C28.1456 33.7505 24.9199 39.3453 24.9199 45.6935C24.9199 55.8216 33.1303 64.032 43.2584 64.032C53.3864 64.032 61.5969 55.8216 61.5969 45.6935C61.5969 39.4726 58.4993 33.9753 53.7625 30.6595" />
      <path d="M43.2584 23.4644V45.2225" />
    </svg>
  );
}

/** GPS Fix Protection (2026-11-09), from assets/icons/settings/GPS.svg: a
 *  satellite and its signal. Line 7 on a 105 box draws as heavy as the Auto
 *  Stop's 6 on 87 at the same size. */
export function GpsFixIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 105 105"
      className={`overflow-visible ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="52.2467" cy="52" r="11.78" />
      <path d="M83.8182 20.4285L61.3376 42.9091" />
      <path d="M43.5958 60.6508L20.4285 83.8182" />
      <path d="M65.3896 27.6895L91.0792 2.00001L102.247 13.1676L76.5572 38.8571L65.3896 27.6895Z" />
      <path d="M2 91.0792L27.6895 65.3897L38.8571 76.5572L13.1676 102.247L2 91.0792Z" />
      <path d="M56.4585 76.6419C67.7417 76.6419 76.8885 67.4951 76.8885 56.2119" />
      <path d="M56.4585 89.0735C74.6075 89.0735 89.3201 74.3608 89.3201 56.2119" />
      <path d="M56.4585 102C81.7466 102 102.247 81.5 102.247 56.2119" />
    </svg>
  );
}

/** Sleep Timer (2026-11-09), from assets/icons/settings/sleep time.svg: a
 *  clock inside a cycle, drawn at the Auto Stop's weight (6 on 87). */
export function SleepTimerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87 87"
      className={`overflow-visible ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M43.1399 43.1225V17.3966" />
      <path d="M43.1399 43.1224L55.5347 55.5172" />
      <path d="M14.0494 72.2304C30.1156 88.2966 56.164 88.2966 72.2302 72.2304C83.1581 61.3025 86.653 45.7564 82.7151 31.8746" />
      <path d="M72.2303 14.0496C56.1641 -2.01654 30.1157 -2.01654 14.0495 14.0496C4.35626 23.7429 0.511265 37.0697 2.51453 49.6457" />
      <path d="M13.4457 82.3214V71.6266H24.1405" />
      <path d="M73.2964 5.19818L73.2964 15.893L62.6016 15.893" />
    </svg>
  );
}

/** Sleep Mode (2026-11-09), from assets/icons/settings/sleep_2.svg: the
 *  "Zz" alone. Taller than wide; in a square box it sits centred, so the
 *  row's text stays in line with the other rows'. The source's clipPath
 *  only cut the round caps, so it was dropped. Line 4.5 on a 70-high box
 *  draws as heavy as the other rows at 28 px. */
export function SleepModeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 42 70"
      className={`overflow-visible ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2H39.8854L2.61105 39.2743H38.9688" />
      <path d="M26.413 54.1775H39.8854L26.6303 67.4327H39.5595" />
    </svg>
  );
}

/** Timed Sleep (2026-11-09), from assets/icons/settings/sleep_clock.svg: a
 *  clock with a single "Z" — the Sleep Mode card. Line 6.3 on a 91 box. */
export function TimedSleepIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 91 88"
      className={`overflow-visible ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="6.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.52283 43.8438C4.52283 66.9536 23.257 85.6877 46.3667 85.6877C69.4764 85.6877 88.2105 66.9536 88.2105 43.8438C88.2105 20.7341 69.4764 2 46.3667 2" />
      <path d="M46.3667 43.8439V16.2271" />
      <path d="M46.3667 43.8439L59.6725 57.1496" />
      <path d="M2 4.80554H27.9497L2.41854 30.3367H27.3219" />
    </svg>
  );
}

/** Motion-Aware Sleep (2026-11-09), from assets/icons/settings/zzzleep.svg:
 *  a smaller "Zz" between two zigzags of movement. Line 7 on a 105 box. */
export function MotionSleepIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 99 105"
      className={`overflow-visible ${className ?? ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M97.0889 103.078L80.382 86.1323L96.8855 69.1867L80.382 52.2411L96.8855 35.2954L80.8937 18.3498L97.0889 1.40417" />
      <path d="M1.79663 1.40417L18.5035 18.3498L2 35.2954L18.5035 52.2411L2 69.1867L17.9918 86.1323L1.79663 103.078" />
      <path d="M36.7999 31.5273H60.7864L37.1868 55.1268H60.206" />
      <path d="M54.0295 77.6973H62.5594L54.1671 86.0895H62.353" />
    </svg>
  );
}

/** The logger (2026-11-08): the box on the frame, with its radio. */
export function MenuLoggerIcon({ className }: { className?: string }) {
  return (
    <svg
      // Framed on the drawing's own box (x 2–28.3, y 1.2–26 with the
      // stroke), so the glyph sits centred in the rail (2026-11-09) — the
      // antenna had pulled it up and right.
      viewBox="1.15 -0.4 28 28"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="10" width="17" height="15" rx="4.5" />
      <circle cx="11.5" cy="17.5" r="2" fill="currentColor" stroke="none" />
      <path d="M19.5 6.5a5 5 0 0 1 3.5 3.5" />
      <path d="M19.5 2.2a9.3 9.3 0 0 1 7.8 7.8" />
    </svg>
  );
}
