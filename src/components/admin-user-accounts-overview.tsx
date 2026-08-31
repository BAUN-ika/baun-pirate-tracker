import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { CoordsLink } from "@/components/coords-link";

type AccountRow = {
  id: string;
  owner_user_id: string;
  ikariam_username: string;
  fortress_coordinates: string | null;
  current_pirate_points: number;
};

type UserRow = {
  id: string;
  username: string;
  email: string;
  accounts: AccountRow[];
};

export function UserAccountsOverview() {
  const [q, setQ] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const query = useQuery({
    queryKey: ["admin-user-accounts-overview"],
    queryFn: async (): Promise<UserRow[]> => {
      const [{ data: profiles }, { data: accounts }] = await Promise.all([
        supabase.from("profiles").select("id, username, email"),
        supabase
          .from("ikariam_accounts")
          .select(
            "id, owner_user_id, ikariam_username, fortress_coordinates, current_pirate_points",
          ),
      ]);
      const byOwner = new Map<string, AccountRow[]>();
      ((accounts ?? []) as AccountRow[]).forEach((a) => {
        const list = byOwner.get(a.owner_user_id) ?? [];
        list.push(a);
        byOwner.set(a.owner_user_id, list);
      });
      return (profiles ?? []).map((p: any) => ({
        id: p.id,
        username: p.username,
        email: p.email,
        accounts: (byOwner.get(p.id) ?? []).sort((a, b) =>
          a.ikariam_username.localeCompare(b.ikariam_username),
        ),
      }));
    },
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = query.data ?? [];
    if (needle) {
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle) ||
          u.accounts.some((a) =>
            a.ikariam_username.toLowerCase().includes(needle),
          ),
      );
    }
    return [...list].sort((a, b) =>
      sortDesc
        ? b.accounts.length - a.accounts.length
        : a.accounts.length - b.accounts.length,
    );
  }, [query.data, q, sortDesc]);

  return (
    <div className="pirate-card rounded-2xl p-6 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-gold" />
          <h2 className="font-display text-lg">User accounts overview</h2>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Traži po useru, emailu ili Ikariam nalogu"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40">
            <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">Platform user</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">
                <button
                  className="uppercase tracking-widest hover:text-gold"
                  onClick={() => setSortDesc((v) => !v)}
                >
                  Broj naloga {sortDesc ? "↓" : "↑"}
                </button>
              </th>
              <th className="px-3 py-2 text-right">Ukupno poena</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Učitavam...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Nema rezultata.
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const isOpen = !!open[u.id];
                const total = u.accounts.reduce(
                  (s, a) => s + (a.current_pirate_points ?? 0),
                  0,
                );
                return (
                  <Fragment key={u.id}>
                    <tr
                      className="border-t border-border cursor-pointer hover:bg-background/40"
                      onClick={() =>
                        setOpen((o) => ({ ...o, [u.id]: !o[u.id] }))
                      }
                    >
                      <td className="px-3 py-3 text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium">{u.username}</td>
                      <td className="px-3 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-3 tabular-nums">{u.accounts.length}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gold">
                        {total.toLocaleString("de-DE")}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-border/50">
                        <td colSpan={5} className="px-3 py-3 bg-background/30">
                          {u.accounts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Nema dodanih Ikariam naloga.
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left uppercase tracking-widest text-muted-foreground">
                                  <th className="px-2 py-1">Ikariam username</th>
                                  <th className="px-2 py-1">Koordinate</th>
                                  <th className="px-2 py-1 text-right">Poeni</th>
                                </tr>
                              </thead>
                              <tbody>
                                {u.accounts.map((a) => (
                                  <tr key={a.id} className="border-t border-border/40">
                                    <td className="px-2 py-1.5">{a.ikariam_username}</td>
                                    <td className="px-2 py-1.5">
                                      <CoordsLink coords={a.fortress_coordinates ?? ""} />
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">
                                      {(a.current_pirate_points ?? 0).toLocaleString("de-DE")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
