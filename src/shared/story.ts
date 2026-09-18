export type StoryScene={eyebrow:string;title:string;lines:string[]};
export const INTRO:StoryScene={eyebrow:'STREETBRAWL — L’ULTIMA PARTITA',title:'IL FURTO',lines:['Il Neon Corner sta preparando il torneo di quartiere.','Ma il suo storico cabinato è sparito. Sui cavi tagliati resta un simbolo: BLACK CIRCUIT.','Alex, Matt, Elisa e Gaga partono prima che il cabinato lasci la città.']};
export const STAGE_INTROS:Record<number,StoryScene>={
1:{eyebrow:'STAGE 1 · NEON CORNER',title:'IL QUARTIERE',lines:['Le prime tracce portano fuori dalla sala giochi.','Bruno controlla la strada e sa chi ha preso il cabinato.']},
2:{eyebrow:'STAGE 2 · NIGHT MARKET',title:'IL MERCATO',lines:['Una ricevuta di Bruno indica il mercato notturno.','Tra le bancarelle compaiono casse marchiate BLACK CIRCUIT. Roxy protegge il carico.']},
3:{eyebrow:'STAGE 3 · LAST TRAIN',title:'LA METROPOLITANA',lines:['Sulle casse c’è un biglietto merci per l’ultimo treno.','Switch aspetta sul convoglio. La destinazione stampata è MOLO 7.']},
4:{eyebrow:'STAGE 4 · BLACK CIRCUIT DEPOT',title:'IL DEPOSITO',lines:['Il treno conduce al deposito industriale della banda.','Container 08 contiene pezzi del Neon Corner. Rivet sorveglia la spedizione.']},
5:{eyebrow:'STAGE 5 · HARBOR RUN',title:'IL PORTO',lines:['Il manifesto di carico porta al Molo 7.','Crane sta facendo imbarcare Container 08. Il cabinato è ancora intero.']},
6:{eyebrow:'STAGE 6 · LAST SHIPMENT',title:'LA NAVE CARGO',lines:['La nave sta per salpare. Non c’è più tempo.','Dock Master aspetta sul ponte, davanti al cabinato del Neon Corner.']}};
export const STAGE_OUTROS:Record<number,StoryScene>={
1:{eyebrow:'INDIZIO',title:'UNA RICEVUTA',lines:['Bruno lascia cadere una ricevuta: NIGHT MARKET.','Sul retro, il simbolo Black Circuit.']},
2:{eyebrow:'INDIZIO',title:'ULTIMO TRENO',lines:['Roxy aveva un documento merci.','Il carico viaggia stanotte sulla metropolitana.']},
3:{eyebrow:'INDIZIO',title:'MOLO 7',lines:['Switch non riesce a fermarvi.','Sul vagone: BLACK CIRCUIT DEPOT → MOLO 7.']},
4:{eyebrow:'INDIZIO',title:'CONTAINER 08',lines:['Rivet cade. La distinta di spedizione è ancora accesa.','CONTAINER 08. HARBOR RUN. MOLO 7.']},
5:{eyebrow:'ULTIMA TRACCIA',title:'LAST SHIPMENT',lines:['Crane indica la nave che lascia il molo.','Il cabinato è a bordo. Questa è l’ultima possibilità.']}};
export const FINALE:StoryScene={eyebrow:'NEON CORNER',title:'L’ULTIMA PARTITA',lines:['Dock Master è sconfitto. Il cabinato torna finalmente a casa.','Le luci del Neon Corner si riaccendono e il quartiere si riempie di gente.','Sul display compare una scritta: STREETBRAWL TOURNAMENT — PRESS START.']};
