import { createFileRoute } from "@tanstack/react-router";
import { Radar, Bookmark, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/pirate-scanner")({
  component: PirateScannerPage,
});

const BOOKMARKLET_HREF = `javascript:(()=>{const s=document.createElement('script');s.src='https://baun-pirate-tracker.lovable.app/ikariam-pirates.js?v='+Date.now();document.body.appendChild(s);})()`;

function PirateScannerPage() {
  return (
    <div>
      <PageHeader
        title="Ikariam Pirate Scanner"
        description="Bookmarklet alat za jednoklik skeniranje Pirate Fortress rankings stranice u Ikariamu."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pirate-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
              <Radar className="size-5 text-gold" />
            </div>
            <h2 className="font-display text-xl">Bookmarklet</h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Prevuci dugme ispod u <strong className="text-foreground">bookmarks bar</strong>{" "}
            tvog browsera. Zatim otvori Ikariam i klikni bookmarklet dok si na
            stranici Pirate Fortress rankings.
          </p>

          <div className="flex items-center justify-center py-6 border border-dashed border-gold/30 rounded-xl bg-card/40">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href={BOOKMARKLET_HREF}
              draggable="true"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-b from-gold/30 to-gold/10 border border-gold/60 text-gold font-display text-base shadow-lg hover:from-gold/40 hover:to-gold/20 transition cursor-grab active:cursor-grabbing"
              title="Prevuci u bookmarks bar"
            >
              <Bookmark className="size-4" />
              Pirate Scanner
            </a>
          </div>

          <div className="text-xs text-muted-foreground flex gap-2">
            <Info className="size-4 shrink-0 mt-0.5" />
            <span>
              Ako tvoj browser ne dozvoljava prevlačenje (drag-and-drop) linkova,
              klikni desnim klikom na dugme i odaberi "Add to bookmarks" /
              "Bookmark this link".
            </span>
          </div>
        </div>

        <div className="pirate-card rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-xl">Upute za korištenje</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-foreground/90">
            <li>Prevuci dugme "Pirate Scanner" u bookmarks bar browsera.</li>
            <li>Otvori Ikariam i idi na Pirate Fortress rankings.</li>
            <li>Klikni bookmarklet.</li>
            <li>Sačekaj poruku da su podaci kopirani.</li>
            <li>
              Ako browser ne dozvoli automatsko kopiranje, kopiraj tekst iz
              prikazanog polja ručno.
            </li>
            <li>Vrati se u BAUN Pirate Tracker.</li>
            <li>
              Otvori stranicu{" "}
              <strong className="text-gold">Highscore unos</strong>.
            </li>
            <li>Zalijepi kopirane podatke u textarea.</li>
            <li>Pregledaj preview parsiranih redova.</li>
            <li>Klikni "Sačuvaj highscore unos".</li>
          </ol>
        </div>
      </div>

      <div className="pirate-card rounded-2xl p-5 mt-6 border-warn/40">
        <div className="text-xs text-muted-foreground">
          <strong className="text-warn">Disclaimer:</strong> Ovo je neslužbeni
          helper alat i nije povezan sa Ikariamom ili Gameforge-om.
        </div>
      </div>
    </div>
  );
}
