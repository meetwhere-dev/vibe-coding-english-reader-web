import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right" | "bottom";
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function Sheet({
  open,
  onOpenChange,
  side = "right",
  title,
  description,
  className,
  children
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-sheet-overlay" />
        <Dialog.Content className={cn("ui-sheet", `ui-sheet--${side}`, className)}>
          <div className="ui-sheet-header">
            <div>
              <Dialog.Title className="ui-sheet-title">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="ui-sheet-description">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button className="ui-sheet-close" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="ui-sheet-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
