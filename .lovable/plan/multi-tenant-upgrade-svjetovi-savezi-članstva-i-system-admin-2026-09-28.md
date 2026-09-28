# Multi-tenant upgrade: svjetovi, savezi, članstva i system admin

Cilj: aplikacija podržava više svjetova i više saveza po svijetu. Postojeći BAUN korisnici ne primjećuju nikakvu promjenu. Sve radi isto za bilo koji savez; BAUN je samo prvi, migrirani savez.

## Kako će izgledati korisnicima

- **Obični član (jedan savez):** sve izgleda kao sada. Gore desno piše samo "🇬🇧 Nereus".
- **Član više saveza/svjetova:** gore desno je izbornik svijeta i saveza. Nakon promjene sve stranice (Moji nalozi, poeni, liste, mapa, klasteri, rejoni...) prikazuju samo podatke tog saveza.
- **System admin (bigdataspecialist):** dobija novu stranicu "System Admin" i može izabrati "gledaj kao" bilo koji savez. Dok to radi, na vrhu stoji traka "System Admin View: Nereus / BAUN" sa dugmetom za izlaz.
- **Registracija:** passcode određuje savez. Nepostojeći ili neaktivan passcode odbija registraciju. Svaki savez ima svoj jedinstveni passcode. Postojeći BAUN passcode ostaje isti.
- **Global visibility (default OFF):** kad je system admin uključi za savez ili korisnika, UI ostaje isti. Samo se u listama, na mapi, u klasterima i najbližim poenima pojavi više igrača. Za tuđe mete se vidi samo ime, koordinate, poeni, savez, grad i status, bez imena ko je krenuo ili pokupio i bez tuđih rejona. Odnos (Deal/Protected/Other) se uvijek računa po postavkama saveza koji gleda.

## Faze isporuke

Radim u fazama, a svaka se zasebno provjerava i objavljuje. Tako BAUN nikad ne ostane bez rada.

1. **Temelj u bazi (bez vidljive promjene)**
   - Nove tabele: worlds, alliances (sa passcode-om), user_memberships, system_admins, alliance_visibility_permissions, user_visibility_permissions.
   - Kreiraju se Nereus 🇬🇧 i Balkan Union / BAUN, a BAUN preuzima trenutni passcode.
   - Svaka postojeća tabela sa podacima saveza dobija world_id i alliance_id. Svi postojeći redovi se popunjavaju sa BAUN/Nereus.
   - Svi postojeći korisnici dobijaju članstvo u BAUN-u sa istim rolama. bigdataspecialist dobija system_admin.
   - Novi redovi automatski dobijaju savez aktivnog korisnika, pa postojeći ekrani rade i prije izmjena koda.

2. **Sigurnost (RLS) po savezu**
   - Pomoćne provjere u bazi: da li je korisnik član saveza, koju rolu ima u tom savezu i da li je system admin.
   - Sva pravila čitanja i pisanja se prepisuju tako da korisnik vidi i mijenja samo podatke saveza u kojem je član. Ovo važi i kad frontend pošalje pogrešan savez.
   - Provjera rola (admin, glavni pirat, pirat, ide na plasman) ide po rolama u tom savezu, ne globalno.

3. **Aktivni kontekst u aplikaciji**
   - Aktivni savez i svijet se čuvaju po korisniku. Server ih uvijek provjerava prema članstvu (a za system admina prema view-as izboru).
   - Sve server funkcije (poeni, pokupi, liste, CURRENT_PLAYER, misije, klasteri, najbliži, mapa, rejoni, Excel import, odnosi, runde, audit, admin panel) filtriraju i upisuju po aktivnom savezu.
   - Oznaka svijeta i izbornik gore desno, plus traka za view-as.

4. **Registracija i runde**
   - Registracija traži savez po passcode-u i kreira članstvo.
   - Piratske runde od 21 dan se vode po savezu, pa automatski reset jednog saveza ne dira drugi. Admin panel mijenja passcode samo za svoj savez.
   - Pravila za 18:00 (Europe/Sarajevo) ostaju ista. Struktura je spremna za zasebnu vremensku zonu po svijetu.

5. **System Admin panel** (`/system-admin`, vidljiv samo system adminu)
   - Svjetovi: lista, dodaj, uredi (naziv, država, zastava).
   - Savezi: po svijetu, dodaj, uredi, passcode, aktivan/neaktivan.
   - Članstva: pretraga korisnika, dodaj u svijet/savez sa rolom, deaktiviraj.
   - Gledaj kao: izbor svijeta i saveza.
   - Global visibility: prekidači po savezu i po korisniku (highscore, klasteri, najbliži, mapa). Postavka za korisnika ima prednost nad postavkom saveza.

6. **Global visibility sa zaštićenim podacima**
   - Server vraća tuđe podatke u očišćenom obliku: bez onoga ko je unio, ko je krenuo ili ko je pokupio, bez vlasnika naloga i bez rejona.
   - Tuđi status se prikazuje samo kao READY / EN_ROUTE / COLLECTED.
   - Odnos se računa isključivo iz odnosa aktivnog saveza.

7. **Provjera**: ručno prolazim svih 17 test scenarija iz dokumenta, uz testni savez i testnog korisnika u drugom svijetu. Kasnije ih brišem.

## Tehnički detalji

- Role po savezu idu u `user_memberships.role` (app_role enum). `system_admin` se čuva u posebnoj tabeli `system_admins`, ne u rolama saveza. Postojeći `user_roles` ostaje kao DEPRECATED fallback za vrijeme prelaska.
- Nove SECURITY DEFINER funkcije: `is_system_admin(uid)`, `is_alliance_member(uid, alliance)`, `has_alliance_role(uid, alliance, role)`, `active_alliance_id()` (čita `user_active_context`: user_id, world_id, alliance_id, validira članstvo ili system_admin).
- BEFORE INSERT trigger `set_tenant_ids()` na svim scoped tabelama puni world_id/alliance_id iz `active_alliance_id()` ako nedostaju. Kolone su nullable → backfill → NOT NULL u kasnijoj migraciji.
- Jedinstveni ključevi (npr. `pirate_target_status` po username_key+round, `player_relations`, `alliance_relations`, region players) proširuju se sa alliance_id.
- `pirate_rounds` dobija alliance_id. `active_pirate_round_id()` postaje po savezu, a `complete_due_pirate_rounds()` resetuje samo naloge i statuse tog saveza. `app_settings.baun_passcode_hash` prelazi u `alliances.passcode_hash` (UNIQUE).
- Global reads idu kroz server funkcije sa admin klijentom, i to tek nakon provjere dozvole. Vraćaju eksplicitnu projekciju očišćenih kolona. RLS i dalje blokira direktan pristup tuđim redovima.
- Klijentski resolver (`use-current-targets`, klasteri, najbliži, mapa) prima izvor iz server funkcije. `effective_relation` se uvijek računa lokalno.
- Query ključevi dobijaju alliance_id, pa promjena konteksta osvježava sve.

## Spajanje istog igrača iz više saveza (global view)

- Ako isti igrač postoji u globalnom pregledu iz više saveza, važe ista postojeća pravila prioriteta kao i sada:
  - ručni unos kroz "Moji nalozi" i CURRENT_PLAYER se uvijek vjeruju;
  - za ostale unose iz liste, lista važi samo ako između posljednjih 18:00 i trenutka unosa liste nije bilo druge promjene za tog igrača (ručni unos, misija, CURRENT_PLAYER, pokupi);
  - pokupljanje ima prednost nad sinhronizacijom iz liste.
- Pravila se primjenjuju nad unosima iz svih vidljivih saveza. Tuđi operativni detalji ostaju skriveni.

## Napomena

- Zbog veličine, ovo je nekoliko uzastopnih krugova rada. Nakon svake faze javljam šta je gotovo.
