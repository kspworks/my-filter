import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

// Decorative on purpose: a label would be untranslated and would change the
// accessible name of the button it sits in. Mark the button `aria-busy` instead.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden
      className={cn("animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
