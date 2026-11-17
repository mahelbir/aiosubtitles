import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "cn"

const cardHeaderVariants = cva(
  "group/card-header @container/card-header grid auto-rows-min items-center gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing) data-[divider=true]:border-b data-[divider=true]:pb-[calc(var(--card-spacing)-var(--spacing))]",
  {
    variants: {
      variant: {
        default: "",
        muted: "bg-muted/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const cardFooterVariants = cva(
  "flex items-center rounded-b-xl border-t p-(--card-spacing)",
  {
    variants: {
      variant: {
        default: "bg-muted/50",
        plain: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const cardTitleVariants = cva("font-medium", {
  variants: {
    variant: {
      default: "",
      primary: "text-primary",
    },
    casing: {
      normal: "",
      upper: "uppercase",
    },
    size: {
      default: "text-base leading-snug group-data-[size=sm]/card:text-sm",
      lg: "text-xl",
    },
  },
  defaultVariants: {
    variant: "default",
    casing: "normal",
    size: "default",
  },
})

function Card({
  className,
  size = "default",
  ...props
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props} />
  );
}

function CardHeader({
  className,
  variant = "default",
  hasDivider = true,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      data-divider={hasDivider}
      className={cn(cardHeaderVariants({ variant }), className)}
      {...props} />
  );
}

function CardTitle({
  className,
  variant = "default",
  casing = "normal",
  size = "default",
  ...props
}) {
  return (
    <div
      data-slot="card-title"
      className={cn(cardTitleVariants({ variant, casing, size }), className)}
      {...props} />
  );
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props} />
  );
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end group-not-has-data-[slot=card-description]/card-header:row-auto group-not-has-data-[slot=card-description]/card-header:self-center",
        className
      )}
      {...props} />
  );
}

function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props} />
  );
}

function CardFooter({
  className,
  variant = "default",
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(cardFooterVariants({ variant }), className)}
      {...props} />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
