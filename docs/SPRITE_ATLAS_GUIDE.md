# StreetBrawl — Sprite atlas integration

Source sheets supplied 2026-09-17 contain four rows x eight key poses. They are treated as source art, not prebuilt atlases.

## Identity mapping

Playable rows: Alex (blue jacket/orange shirt), Matt (green hoodie), Elisa (purple), Gaga (yellow/black, original character). Boss rows: Roxy (red/black), Switch (hooded blue/black), Rivet (orange workwear), Crane (blue/yellow dock workwear). Bruno remains Stage 1; Dock Master remains Stage 6.

## Prepared atlas contract

Runtime paths reserved:
- `/assets/fighters/coop/alex.png`
- `/assets/fighters/coop/matt.png`
- `/assets/fighters/coop/elisa.png`
- `/assets/fighters/coop/gaga.png`
- `/assets/fighters/bosses/roxy.png`
- `/assets/fighters/bosses/switch.png`
- `/assets/fighters/bosses/rivet.png`
- `/assets/fighters/bosses/crane.png`

Each source row has been inspected independently. Pose bounds are not assumed to be an equal grid; punch/cross limbs can cross theoretical cell boundaries. Background removal uses true alpha. Pivots are ground-relative and must remain stable when the frame rectangle changes.

## Pose indices

0 guard/idle; 1 walk key; 2 jab; 3 cross; 4 playable kick or boss attack tell; 5 hurt; 6 knockdown/KO; 7 get-up.

These are key poses only. Current source art does **not** constitute complete animation cycles. Until generated in-betweens are added, animation metadata must explicitly label idle/walk repetition and attack transitions as source-pose fallbacks. Do not report them as completed animation art.

## Gameplay rule

Hitboxes, hurtboxes, attack range and authoritative hit timing remain simulation data. Sprite pixels never determine combat geometry. Network snapshots communicate character/state/action timing; receiving snapshots must not restart an animation every packet.

## Boss motion target

- Roxy: fast short combos, readable recovery vulnerability.
- Switch: feints and lateral dashes with a readable tell.
- Rivet: heavy strikes and clearly telegraphed area attack.
- Crane: broad space-control attacks with understandable safe areas for two players.

## Remaining art work

Dedicated jump, grab and throw frames are not present in the supplied sheets. Boss pose 4 is only anticipation; execution/recovery frames for signature attacks still need dedicated art. These gaps must use documented fallbacks until new frames are produced.
