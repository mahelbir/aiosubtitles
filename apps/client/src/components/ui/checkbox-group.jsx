"use client"

import { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group"

function CheckboxGroup({
  ...props
}) {
  return <CheckboxGroupPrimitive data-slot="checkbox-group" {...props} />;
}

export { CheckboxGroup }
