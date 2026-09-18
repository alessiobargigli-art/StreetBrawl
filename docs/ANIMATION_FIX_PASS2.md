# Animation Fix Pass 2

## Obiettivo

Correggere il game-feel del movimento e rendere coerente l'uso degli sprite per eroi e nemici, eliminando bleed/crop tra frame adiacenti.

## Problemi verificati sul main

1. **Percezione di accelerazione/rallentamento del player**
   - Il background di stage contiene anche il piano di gioco ma viene scrollato a `camera * 0.35`.
   - Quando la camera inizia a seguire il player, il personaggio resta quasi fermo sullo schermo mentre il fondale scorre solo al 35%: il player sembra rallentare e i nemici, che si muovono anche nel world, sembrano molto più rapidi.
   - La walk animation usa inoltre un elapsed derivato dai tick/snapshot di rete; il jitter può cambiare la cadenza percepita.

2. **Nemico Heavy con sprite sbagliato**
   - Per stati diversi da walk/entering, Heavy finisce nel fallback legacy `thug`.
   - Questo cambia visivamente identità al nemico durante attack/hurt/down.

3. **Crop eroi contaminati**
   - Gli atlas coop correnti hanno rettangoli sovrapposti tra frame adiacenti.
   - L'overlap è presente per Alex, Matt, Elisa e Gaga, incluso il passaggio verso il frame `hurt`, e può catturare pixel della posa vicina.
   - Serve rigenerare atlas puliti con gutter trasparente e rect non sovrapposti.

4. **Walk cycle insufficiente**
   - I quattro frame correnti sono pose diverse ma non costituiscono ancora una sequenza di passo leggibile.
   - Target: almeno contatto A -> passaggio A -> contatto B -> passaggio B, con ulteriori in-between se necessari.

## Piano

### Fase A — game-feel e mapping
- [x] Background world-aligned 1:1 con la camera.
- [x] Clock locale monotono per walk/jump, indipendente dal jitter degli snapshot.
- [x] Eliminare il fallback Heavy -> Thug.
- [ ] Verificare la resa SOLO e CO-OP con camera in movimento (attesa CI/Playwright sul bundle 1.2.4).

### Fase B — audit e ricostruzione atlas combat
- [x] Ricostruire Alex/Matt/Elisa/Gaga dagli originali con frame separati e gutter trasparente.
- [x] Validare idle, punch 1/2, kick, hurt, down/KO, getup.
- [x] Test automatico: nessun rect può sovrapporsi a un altro rect.
- [x] PNG caricati e dimensioni validate contro i metadata; crop non sovrapposti.\n- [ ] Test alpha-edge: ogni rect deve avere bordo trasparente minimo dove possibile.

### Fase C — nuove walk cycle
- [x] Generati e integrati 8 frame walk + 1 jump per ogni personaggio.
- [x] Eroi: atlas movement separati con 8 walk + 1 jump.
- [x] Thug/Ripper/Heavy: atlas movement separati con 8 walk + 1 jump e identità stabile.
- [x] Durata walk costante: 90 ms per frame, clock locale monotono.

### Fase D — enemy combat art
- [x] Atlas identity-specific con attack/hurt/down dedicati per Thug/Ripper/Heavy caricati sul branch.
- [x] Nessun fallback cross-character nel renderer.
- [x] Boss invariati salvo regressioni.

### Fase E — verifica
- [ ] Build + simulation/reconnect/room tests.
- [x] Asset atlas tests: 9 frame, PNG 1254x1254, crop in-bounds/non-overlap, 8 walk ordinati + jump.
- [ ] Playwright SOLO + CO-OP.
- [ ] Check visuale manuale: walk lunga, cambio direzione, salto, hit, KO/getup, 3 archetipi nemici.
- [ ] Merge solo con CI verde e check visuale.

## Stato asset binari

I metadata, il renderer e i PNG puliti sono ora sul branch. Il movement usa sette sheet separati 1254x1254 (8 walk + 1 jump), preservando la cella logica 418x418 per evitare jitter di scala/baseline. La CI verifica firma PNG, dimensioni reali, crop in-bounds/non-overlap e timing costante. Il bundle è versionato 1.2.5 con cache Service Worker ruotata.
