"use client"

import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
import { cn } from "cn"

import { Button } from "@/components/ui/button"

function Toolbar({
  className,
  ...props
}) {
  return (
    <ToolbarPrimitive.Root
      data-slot="toolbar"
      className={cn("flex items-center gap-2", className)}
      {...props} />
  );
}

function ToolbarButton({
  variant,
  size,
  className,
  ...props
}) {
  return (
    <ToolbarPrimitive.Button
      render={<Button variant={variant} size={size} className={className} />}
      {...props} />
  );
}

export { Toolbar, ToolbarButton }
