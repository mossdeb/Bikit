"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        // Segmented control. The track was `sidebar` — the fixed near-black the
        // bottom nav uses — which made a black bar sit between a bike's header
        // and its components and read as a second navigation. It is a filter
        // over the list below it, not a place to go, so it steps back to the
        // card surface with the selected tab a shade darker inside it.
        pill: "relative gap-1 rounded-full bg-card group-data-horizontal/tabs:h-auto",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {/* The pill's fill is this one moving element rather than a background on
          each tab — that's what lets it travel across instead of blinking from
          one side to the other. It ships with the variant so the two can't drift
          apart: the triggers paint no background of their own. */}
      {variant === "pill" && <TabsIndicator />}
      {children}
    </TabsPrimitive.List>
  )
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      // Without this the pill is missing until React hydrates, which on a
      // server-rendered page reads as an unselected control.
      renderBeforeHydration
      className={cn(
        // `muted` against the track's `card`: one step of surface, no more.
        // Both follow the theme, so the selected tab is a shade darker than
        // the track in light and a shade lighter in dark, which is the same
        // reading either way. It was a hardcoded #EFEFEF back when the track
        // was a fixed near-black and the pill had to ignore the theme.
        "absolute top-[var(--active-tab-top)] left-0 h-[var(--active-tab-height)] w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] rounded-full bg-muted",
        // Tailwind v4 animates the `translate` property, not `transform` — a
        // transition on `transform` here would fade nothing and move instantly.
        "transition-[translate,width] duration-250 ease-out motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        // The fill belongs to TabsIndicator, so the tab itself stays see-through
        // and only sits above it — `relative` is already in the base classes.
        "group-data-[variant=pill]/tabs-list:h-auto group-data-[variant=pill]/tabs-list:rounded-full group-data-[variant=pill]/tabs-list:bg-transparent group-data-[variant=pill]/tabs-list:data-active:bg-transparent dark:group-data-[variant=pill]/tabs-list:data-active:border-transparent dark:group-data-[variant=pill]/tabs-list:data-active:bg-transparent",
        // Text colours belong to the variant, not the caller — a plain colour
        // at the call site cannot displace a variant-scoped one. Both states
        // are now readable type on a light surface, so the pair is the
        // ordinary muted/foreground one instead of the white-on-black the dark
        // track needed. The `dark:` copies are kept because the base classes
        // underneath carry their own, and a variant rule only wins where it is
        // written at the same specificity.
        "group-data-[variant=pill]/tabs-list:text-muted-foreground group-data-[variant=pill]/tabs-list:hover:text-foreground group-data-[variant=pill]/tabs-list:data-active:text-foreground dark:group-data-[variant=pill]/tabs-list:text-muted-foreground dark:group-data-[variant=pill]/tabs-list:hover:text-foreground dark:group-data-[variant=pill]/tabs-list:data-active:text-foreground",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none",
        // Base UI unmounts the panel that isn't showing, so the incoming one is
        // always a fresh mount and this enter animation runs on every switch.
        // Nothing can fade *out* for the same reason — the old panel is already
        // gone — which is why this is a plain fade and not a crossfade.
        "animate-in fade-in duration-200 ease-out motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsIndicator, tabsListVariants }
