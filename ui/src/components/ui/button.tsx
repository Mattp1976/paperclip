import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        /**
         * sage — the canonical "do the thing" CTA. Encodes the button treatment
         * used on inline actions like ActiveGoalsCard / WelcomeZeroState / hero
         * CTAs so every primary action reads as the same button rather than 20
         * copy-pasted Tailwind blobs. Chrome only — pair with a size preset (or
         * size="none" + className) to set padding/rounded/text.
         * Hover transitions to the deeper sage `#7C9470`; dark mode lifts to
         * the lighter sage `#A4BD95` for readability on the darker surface.
         */
        sage:
          "bg-[#8FA781] text-white shadow-sm hover:bg-[#7C9470] hover:shadow-md hover:shadow-green-700/20 active:scale-[0.98] dark:bg-[#A4BD95] dark:text-[#22251F] dark:hover:bg-[#B5C4B1]",
        /**
         * sage-elevated — the "hero CTA" tier. Uses the same sage palette as
         * `sage`, but with a beefier dual-stop rgba(94,114,89) shadow and a
         * `-translate-y-0.5` hover lift. Used by the Dashboard header "New
         * Task" button, the Sidebar quick-action, and the UpNext card CTA.
         * Chrome only — pair with a size preset (or size="none" + className)
         * to set padding/rounded/text.
         */
        "sage-elevated":
          "bg-[#8FA781] text-white shadow-[0_2px_4px_rgba(94,114,89,0.12),0_12px_24px_-8px_rgba(94,114,89,0.30)] transition-all duration-200 hover:bg-[#7C9470] hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(94,114,89,0.18),0_16px_32px_-8px_rgba(94,114,89,0.40)] active:translate-y-0 dark:bg-[#A4BD95] dark:text-[#22251F] dark:hover:bg-[#B5C4B1]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-10",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-10",
        /**
         * none — zero sizing. Use when the variant or callsite className fully
         * defines the geometry (e.g. sage-elevated hero CTAs whose padding
         * varies per surface).
         */
        none: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
