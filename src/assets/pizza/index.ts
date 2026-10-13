// The illustration kit of the "L'atelier" section (see generate.mjs for how the drawings are made and the
// layer contract). Imported dynamically by Atelier.tsx, so these ~45 KB (gzipped) of SVG markup live in their
// own chunk, fetched only when the section approaches the viewport.
import board from './board.svg?raw';
import boxBase from './box-base.svg?raw';
import lidInside from './lid-inside.svg?raw';
import lidOutside from './lid-outside.svg?raw';
import pizza from './pizza.svg?raw';

export const art = { board, pizza, boxBase, lidInside, lidOutside };
export type PizzaArt = typeof art;
