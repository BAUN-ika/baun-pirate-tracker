import { Eye, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/hooks/use-tenant";
import { LanguageSelect } from "@/components/language-select";

/** Oznaka svijeta gore desno; izbornik samo kad korisnik ima više članstava. */
export function TenantBar() {
  const { tenant, switchTo, exitViewAs } = useTenant();
  if (!tenant || !tenant.activeAlliance)
    return (
      <div className="flex justify-end mb-4">
        <LanguageSelect />
      </div>
    );
  const { activeWorld, activeAlliance, memberAlliances, worlds, isViewAs } = tenant;
  const worldLabel = (id: string) => {
    const w = worlds.find((x) => x.id === id);
    return w ? `${w.flag_emoji ?? ""} ${w.name}`.trim() : "";
  };
  const change = async (id: string) => {
    try {
      await switchTo(id);
    } catch (e: any) {
      toast.error("Promjena konteksta nije uspjela", { description: e?.message });
    }
  };

  return (
    <div className="space-y-2 mb-4">
      {isViewAs && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-destructive">
            <Eye className="size-4" />
            System Admin View: {activeWorld?.name} / {activeAlliance.tag}
          </span>
          <Button size="sm" variant="outline" onClick={() => exitViewAs()}>
            Izađi iz view-as
          </Button>
        </div>
      )}
      <div className="flex justify-end items-center gap-2 text-sm">
        {memberAlliances.length > 1 && !isViewAs ? (
          <Select value={activeAlliance.id} onValueChange={change}>
            <SelectTrigger className="h-8 w-auto min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memberAlliances.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {worldLabel(a.world_id)} · {a.tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span data-no-i18n className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground">
            {activeWorld?.flag_emoji ? (
              <span>{activeWorld.flag_emoji}</span>
            ) : (
              <Globe2 className="size-3.5" />
            )}
            {activeWorld?.name}
          </span>
        )}
        <LanguageSelect />
      </div>
    </div>
  );
}
