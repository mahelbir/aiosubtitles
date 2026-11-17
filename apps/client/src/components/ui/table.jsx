"use client"

import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "cn"

const tableRowVariants = cva(
  "border-b transition-colors data-[state=selected]:bg-muted",
  {
    variants: {
      variant: {
        default:
          "hover:bg-opaque-muted/50 has-aria-expanded:bg-opaque-muted/50",
        header: "bg-muted",
        body: "bg-background hover:bg-muted has-aria-expanded:bg-muted",
        subtle:
          "bg-opaque-muted/30 hover:bg-muted has-aria-expanded:bg-muted",
        detail: "bg-opaque-muted/30",
        placeholder: "bg-background",
        flash:
          "bg-opaque-primary/10 hover:bg-opaque-primary/10 has-aria-expanded:bg-muted dark:bg-opaque-primary/20 dark:hover:bg-opaque-primary/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Table({
  className,
  containerClassName,
  ...props
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto overscroll-x-none", containerClassName)}>
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props} />
    </div>
  );
}

function TableHeader({
  className,
  ...props
}) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props} />
  );
}

function TableBody({
  className,
  ...props
}) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props} />
  );
}

function TableFooter({
  className,
  ...props
}) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props} />
  );
}

function TableRow({
  className,
  variant = "default",
  ...props
}) {
  return (
    <tr
      data-slot="table-row"
      className={cn(tableRowVariants({ variant }), className)}
      {...props} />
  );
}

function TableHead({
  className,
  ...props
}) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props} />
  );
}

function TableCell({
  className,
  ...props
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props} />
  );
}

function TableCaption({
  className,
  ...props
}) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props} />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
