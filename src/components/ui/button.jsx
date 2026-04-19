import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors outline-offset-2 focus-visible:outline focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-orange-500 text-white shadow-warm hover:bg-orange-600",
        destructive: "bg-red-500 text-white shadow-warm hover:bg-red-600",
        outline:     "border border-orange-200 bg-transparent shadow-warm hover:bg-orange-50 hover:text-orange-900",
        secondary:   "bg-orange-100 text-orange-800 shadow-warm hover:bg-orange-200",
        ghost:       "hover:bg-orange-50 hover:text-orange-900",
        link:        "text-orange-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 rounded-lg px-4 py-2",
        sm:      "h-8 rounded-lg px-3 text-xs",
        lg:      "h-10 rounded-lg px-8",
        icon:    "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
