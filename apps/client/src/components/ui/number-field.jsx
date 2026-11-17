"use client"

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"

import { Input } from "@/components/ui/input"

function NumberField({
  ...props
}) {
  return <NumberFieldPrimitive.Root data-slot="number-field" {...props} />;
}

function NumberFieldInput({
  render = <Input />,
  ...props
}) {
  return <NumberFieldPrimitive.Input render={render} {...props} />;
}

export { NumberField, NumberFieldInput }
