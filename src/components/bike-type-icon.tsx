import type { ComponentType } from "react";
import type { BikeType } from "@/lib/constants";

type IconProps = { className?: string };

function RoadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 55" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M82.0124 35.9871L68.5544 2.95158H79.6441" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5584 35.4102L35.2491 2.06705" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5584 35.6611H18.8649L38.5866 10.5293H71.4608L46.5584 35.6611Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29.2131 2H44.3879" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82.0123 52.5261C91.3266 52.5261 98.8772 44.9754 98.8772 35.6611C98.8772 26.3469 91.3266 18.7962 82.0123 18.7962C72.6981 18.7962 65.1473 26.3469 65.1473 35.6611C65.1473 44.9754 72.6981 52.5261 82.0123 52.5261Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M79.7708 2.95158C82.2467 2.95158 84.2538 4.95865 84.2538 7.43451C84.2538 9.91036 82.2467 11.9174 79.7708 11.9174" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.865 52.5261C28.1792 52.5261 35.73 44.9754 35.73 35.6611C35.73 26.3469 28.1792 18.7962 18.865 18.7962C9.55074 18.7962 2 26.3469 2 35.6611C2 44.9754 9.55074 52.5261 18.865 52.5261Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
    </svg>
  );
}

function GravelIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M82.0124 40.8744L68.5545 7.83884H79.6442" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5586 40.2975L33.6978 2.06705" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5584 40.5483H18.8649L39.5018 19.3206L71.4608 15.4166L46.5584 40.5483Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27.6617 2H42.8364" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82.0123 57.4133C91.3265 57.4133 98.8772 49.8626 98.8772 40.5484C98.8772 31.2341 91.3265 23.6834 82.0123 23.6834C72.698 23.6834 65.1474 31.2341 65.1474 40.5484C65.1474 49.8626 72.698 57.4133 82.0123 57.4133Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M79.7708 7.83884C82.2467 7.83884 84.2538 9.8459 84.2538 12.3218C84.2538 14.7976 82.2467 16.8047 79.7708 16.8047" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.865 57.4133C28.1792 57.4133 35.7298 49.8626 35.7298 40.5484C35.7298 31.2341 28.1792 23.6834 18.865 23.6834C9.55074 23.6834 2 31.2341 2 40.5484C2 49.8626 9.55074 57.4133 18.865 57.4133Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
    </svg>
  );
}

function EnduranceRoadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 58" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M82.0123 39.319L68.5543 6.28352L79.6441 3.35684" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5583 38.742L35.2488 2.06702" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5585 38.9929H18.8649L38.5866 13.8612H71.4609L46.5585 38.9929Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29.2132 2H44.3879" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82.0123 55.8578C91.3266 55.8578 98.8773 48.3071 98.8773 38.9929C98.8773 29.6787 91.3266 22.128 82.0123 22.128C72.6981 22.128 65.1475 29.6787 65.1475 38.9929C65.1475 48.3071 72.6981 55.8578 82.0123 55.8578Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M79.7709 3.35684C82.2468 3.35684 84.2539 5.3639 84.2539 7.83975C84.2539 10.3156 82.2468 12.3227 79.7709 12.3227" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.8648 55.8578C28.1791 55.8578 35.7298 48.3071 35.7298 38.9929C35.7298 29.6787 28.1791 22.128 18.8648 22.128C9.5506 22.128 2 29.6787 2 38.9929C2 48.3071 9.5506 55.8578 18.8648 55.8578Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
    </svg>
  );
}

function EnduroIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 61" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M2 42.6422C2 51.4629 9.15063 58.6135 17.9714 58.6135C26.7921 58.6135 33.9427 51.4629 33.9427 42.6422C33.9427 33.8214 26.7921 26.6708 17.9714 26.6708C9.15063 26.6708 2 33.8214 2 42.6422Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9061 58.6135C91.7268 58.6135 98.8773 51.4629 98.8773 42.6422C98.8773 33.8214 91.7268 26.6708 82.9061 26.6708C74.0853 26.6708 66.9347 33.8214 66.9347 42.6422C66.9347 51.4629 74.0853 58.6135 82.9061 58.6135Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9061 42.9633L66.9347 4.55144L74.9204 2.00055" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0562 42.395L34.5076 12.7922" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0564 42.6422L69.7494 11.3212L47.0564 24.4803L47.5311 31.949" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0566 42.6422H17.9716L40.6014 28.2235" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28.5637 12.7261H43.5074" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XCIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 61" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M17.9713 58.0156C26.792 58.0156 33.9426 50.865 33.9426 42.0443C33.9426 33.2236 26.792 26.073 17.9713 26.073C9.15061 26.073 2 33.2236 2 42.0443C2 50.865 9.15061 58.0156 17.9713 58.0156Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9058 58.0156C91.7266 58.0156 98.8772 50.865 98.8772 42.0443C98.8772 33.2236 91.7266 26.073 82.9058 26.073C74.0851 26.073 66.9345 33.2236 66.9345 42.0443C66.9345 50.865 74.0851 58.0156 82.9058 58.0156Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9058 42.3655L66.9345 3.95365L77.3708 3.38824" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0563 41.7972L32.7906 2.06598" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0564 42.0443H17.9714L39.9236 24.4605L69.7495 10.7234L47.0564 42.0443Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26.8467 2H41.7904" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownhillIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 61" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M17.9713 58.6135C26.792 58.6135 33.9426 51.4629 33.9426 42.6422C33.9426 33.8214 26.792 26.6708 17.9713 26.6708C9.1506 26.6708 2 33.8214 2 42.6422C2 51.4629 9.1506 58.6135 17.9713 58.6135Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9058 58.6135C91.7265 58.6135 98.8771 51.4629 98.8771 42.6422C98.8771 33.8214 91.7265 26.6708 82.9058 26.6708C74.085 26.6708 66.9344 33.8214 66.9344 42.6422C66.9344 51.4629 74.085 58.6135 82.9058 58.6135Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9058 42.9633L67.6755 4.26874L74.4589 2.00055" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0563 42.3951L38.2361 15.3657" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M41.2347 23.4495L69.3416 8.50165L47.0563 42.6422" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31.3803 13.9799L42.6461 12.5547" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M48.2372 27.8395L53.7221 25.5719" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0562 42.6422L17.7846 42.7117L43.1897 30.5463" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EMTBIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 104" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M49.5069 12.418C49.3922 13.2936 49.2779 14.1707 49.1573 15.0957L48.8624 17.3535H60.4317C57.1654 23.1701 53.8985 28.9863 50.6319 34.8027C50.8288 32.9029 51.0271 31.0031 51.2247 29.1016C51.32 28.1837 51.4157 27.2626 51.5108 26.3428C51.5275 26.181 51.5431 25.9962 51.5577 25.833L51.753 23.6543H40.463C43.7385 17.9156 47.014 12.1769 50.2901 6.43848C50.0288 8.43136 49.7682 10.424 49.5069 12.418Z" fill="currentColor" stroke="currentColor" strokeWidth="4" />
      <path d="M2 85.661C2 94.4817 9.15057 101.632 17.9713 101.632C26.792 101.632 33.9427 94.4817 33.9427 85.661C33.9427 76.8402 26.792 69.6896 17.9713 69.6896C9.15057 69.6896 2 76.8402 2 85.661Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.906 101.632C91.7267 101.632 98.8773 94.4817 98.8773 85.661C98.8773 76.8402 91.7267 69.6896 82.906 69.6896C74.0853 69.6896 66.9347 76.8402 66.9347 85.661C66.9347 94.4817 74.0853 101.632 82.906 101.632Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9061 85.9821L66.9347 47.5702L74.9204 45.0193" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0562 85.4138L34.5076 55.811" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0564 85.661L69.7495 54.34L47.0564 67.4991L47.5311 74.9678" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0563 85.661H17.9713L40.601 71.2423" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28.5637 55.7449H43.5074" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UrbanIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 59" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M17.9713 56.3449C26.7921 56.3449 33.9427 49.1943 33.9427 40.3735C33.9427 31.5528 26.7921 24.4022 17.9713 24.4022C9.15062 24.4022 2 31.5528 2 40.3735C2 49.1943 9.15062 56.3449 17.9713 56.3449Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9058 56.3449C91.7265 56.3449 98.8771 49.1943 98.8771 40.3735C98.8771 31.5528 91.7265 24.4022 82.9058 24.4022C74.085 24.4022 66.9344 31.5528 66.9344 40.3735C66.9344 49.1943 74.085 56.3449 82.9058 56.3449Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M82.9058 40.6946L67.6755 2H78.5964" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0563 40.1264L34.106 2.65405" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47.0564 40.3734H17.9714L38.2695 15.6541H72.099L47.0564 40.3734Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28.1619 2.58789H43.1056" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OtherBikeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 101 90" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" {...props}>
      <path d="M14.2055 87.3506C20.9464 87.3506 26.411 81.886 26.411 75.1451C26.411 68.4042 20.9464 62.9396 14.2055 62.9396C7.46457 62.9396 2 68.4042 2 75.1451C2 81.886 7.46457 87.3506 14.2055 87.3506Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M73.7936 87.3508C87.6469 87.3508 98.8772 76.1204 98.8772 62.2671C98.8772 48.4138 87.6469 37.1835 73.7936 37.1835C59.9403 37.1835 48.71 48.4138 48.71 62.2671C48.71 76.1204 59.9403 87.3508 73.7936 87.3508Z" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M60.0811 25.9353C48.8405 30.1799 40.0867 39.4914 36.6055 51.0841C35.5421 54.6253 32.1898 66.6332 23.8207 67.6357" stroke="currentColor" strokeWidth="4" strokeMiterlimit="10" />
      <path d="M73.7935 62.7715L49.8737 2H67.0254" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36.0991 21.9106H15.2891" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25.694 21.9106V28.8812C25.694 31.1122 26.6398 33.2386 28.2966 34.7327L38.6856 44.1012" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const BIKE_TYPE_ICON: Partial<Record<BikeType, ComponentType<IconProps>>> = {
  Road: RoadIcon,
  Gravel: GravelIcon,
  "Endurance road": EnduranceRoadIcon,
  Enduro: EnduroIcon,
  XC: XCIcon,
  Downhill: DownhillIcon,
  "E-MTB": EMTBIcon,
  "Urban / Commuter": UrbanIcon,
  Other: OtherBikeIcon,
};

/**
 * The drawing for a bike without a type — saved without a category, or
 * with one the map does not know: an Enduro (by request, 2026-09-24), the
 * shape most of the fleet has, rather than a generic silhouette that
 * marks it as the odd one out. A constant and not a function returning
 * the component, because a component picked by a call during render
 * trips react-hooks/static-components; a map lookup with this after `??`
 * does not. Every place that draws a bike reads the map and falls back
 * to this, so the fallback is one decision.
 */
export const BIKE_ICON_FALLBACK: ComponentType<IconProps> = EnduroIcon;
