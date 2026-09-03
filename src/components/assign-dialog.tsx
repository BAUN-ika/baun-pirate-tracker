import { useState } from "react";
import { Navigation } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * Modal "Ko ide po poene?" — korisnik bira sebe ili ručno unosi ime osobe
 * koja nema nalog u aplikaciji.
 */
export function AssignDialog({
  targetLabel,
  disabled,
  loading,
  onConfirm,
  triggerLabel = "Kreni",
  size = "sm",
  warning,
}: {
  targetLabel: string;
  disabled?: boolean;
  loading?: boolean;
  onConfirm: (pirateName?: string) => void;
  triggerLabel?: string;
  size?: "sm" | "default";
  /** Upozorenje (npr. zabranjen savez) — prikazuje se prije potvrde. */
  warning?: string;
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<"me" | "other">("me");
  const [name, setName] = useState("");

  const confirm = () => {
    if (who === "other" && !name.trim()) return;
    onConfirm(who === "other" ? name.trim() : undefined);
    setOpen(false);
    setWho("me");
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline" disabled={disabled || loading}>
          <Navigation className="size-3.5 mr-1.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ko ide po poene?</DialogTitle>
          <DialogDescription>
            Meta: <b>{targetLabel}</b>. Nakon potvrde meta dobija status EN ROUTE i
            ostali članovi vide da je neko već krenuo.
          </DialogDescription>
        </DialogHeader>

        {warning && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {warning}
          </div>
        )}

        <RadioGroup value={who} onValueChange={(v) => setWho(v as "me" | "other")}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="me" id="who-me" />
            <Label htmlFor="who-me">Ja idem</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="other" id="who-other" />
            <Label htmlFor="who-other">Drugi igrač</Label>
          </div>
        </RadioGroup>

        {who === "other" && (
          <Input
            autoFocus
            placeholder="Ime igrača (npr. Kapetan Crna Brada)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Otkaži
          </Button>
          <Button onClick={confirm} disabled={who === "other" && !name.trim()}>
            Potvrdi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
