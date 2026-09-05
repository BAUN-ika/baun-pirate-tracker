import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { AssignDialog } from "@/components/assign-dialog";
import { StatusBadge } from "@/components/alliance-badge";
import type { RelationType } from "@/components/alliance-badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  statusOf,
  useTargetActions,
  useTargetStatusMap,
  type TargetRef,
} from "@/hooks/use-target-status";

/** Status bedž mete — globalan kroz cijelu aplikaciju. */
export function TargetStatusCell({
  username,
  map,
}: {
  username: string;
  map: ReturnType<typeof useTargetStatusMap>["map"];
}) {
  const st = statusOf(map, username);
  const status = st?.status ?? "ready";
  return (
    <div>
      <StatusBadge status={status} />
      {status === "en_route" && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          EN ROUTE · {st?.assigned_pirate_name ?? "—"}
        </div>
      )}
      {status === "collected" && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Pokupljeno{st?.collected_at ? ` · ${new Date(st.collected_at).toLocaleString("bs-BA")}` : ""}
        </div>
      )}
    </div>
  );
}

/** Kreni / Otkaži / Pokupi — identično ponašanje na svim prikazima. */
export function TargetActions({
  target,
  relation,
  map,
  actions,
}: {
  target: TargetRef;
  relation: RelationType | null;
  map: ReturnType<typeof useTargetStatusMap>["map"];
  actions: ReturnType<typeof useTargetActions>;
}) {
  const { isPirate } = useCurrentUser();
  const st = statusOf(map, target.ikariam_username);
  const status = st?.status ?? "ready";

  const warning =
    relation === "protected"
      ? `${target.ikariam_username} je označen kao ZABRANJENA meta. Da li si siguran da želiš krenuti?`
      : undefined;

  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      {status === "en_route" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={actions.cancel.isPending}
          onClick={() => actions.cancel.mutate(target.ikariam_username)}
        >
          Otkaži
        </Button>
      ) : (
        <AssignDialog
          targetLabel={`${target.ikariam_username} (${target.coordinates ?? "—"})`}
          warning={warning}
          loading={actions.enRoute.isPending}
          onConfirm={(name) => actions.enRoute.mutate({ target, pirate_name: name })}
        />
      )}
      {isPirate && (
        <AssignDialog
          triggerLabel="Pokupi"
          variant="default"
          title="Ko je pokupio poene?"
          description={
            <>
              Meta: <b>{target.ikariam_username}</b>. Ako je neko već krenuo
              {st?.assigned_pirate_name ? ` (${st.assigned_pirate_name})` : ""}, njemu se
              upisuje učinak — osim ako ovdje izabereš drugu osobu.
            </>
          }
          defaultOtherName={st?.assigned_pirate_name ?? ""}
          disabled={status === "collected"}
          loading={actions.collect.isPending}
          onConfirm={(name) =>
            actions.collect.mutate({ target, collected_by_name: name })
          }
        />
      )}
      {isPirate && status === "collected" && (
        <span className="text-[10px] text-muted-foreground">
          <Coins className="size-3 inline mr-1" />
          pokupljeno
        </span>
      )}
    </div>
  );
}
