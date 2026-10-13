# Photos

Put B&B Park's own photos here (JPEG, PNG, WebP or AVIF — the larger the better,
ideally at least 2400 px wide for the hero). Then reference them by file name in
`content/restaurant.ts`, for example:

```ts
hero: { …, photo: 'salle-terrasse.jpg', slides: ['salle-terrasse.jpg', 'grillade.jpg'] },
story: { …, photo: 'chef-en-cuisine.jpg', detailPhoto: 'the-a-la-menthe.jpg' },
gallery: [
  { photo: 'plateau-fruits-de-mer.jpg', alt: { fr: 'Plateau de fruits de mer', en: 'Seafood platter' } },
],
```

`npm run photos` (also run by `npm run dev` / `npm run build`) generates
optimised responsive versions automatically (AVIF, WebP and JPEG in
`public/photos/`, plus `src/generated/photos.json`). Run it again after adding,
replacing or removing a file. Where no photo is set, the site shows a drawn
placeholder (a fine gold zellige pattern) — it never uses stock photos.

Shapes that work best:

| Use | Shape |
| --- | --- |
| Hero (`hero.photo`, `hero.slides`) | Landscape 16:9, subject on the right, darker left third for the text |
| Story (`story.photo`) | Portrait 4:5 or 3:4 |
| Story detail (`story.detailPhoto`) | Landscape 4:3, a close-up |
| Gallery | In groups of four: 1st landscape (large tile), 2nd and 3rd portrait, 4th a wide strip (2:1) |

## Illustrative photos

The files named `illustration-*.jpg` are AI-generated stand-ins (see
`CREDITS.md`): they show the kind of cuisine, **not** B&B Park's rooms or
dishes. Every file listed in `illustrations` in `content/restaurant.ts` is
captioned "Photo d'illustration" / "Illustrative photo" wherever it appears.
When you replace one with a real photo of the restaurant, remove its name from
that list (and delete the old file).

## Sample-menu dish photos (`menu/`)

`menu/<dish-name>.jpg` is attached to the sample dish of the same name
(e.g. `menu/poisson-grille-du-jour.jpg` → "Poisson grillé du jour") by
`npm run cli -- seed --demo`, `npm run cli -- demo-photos`, and the dashboard
button "Charger le menu d'exemple" (on Vercel these files ship with the API
function, see `includeFiles` in `vercel.json`). While the sample menu is shown,
its photos are captioned as illustrations too.

The restaurant's real dish photos are uploaded directly from the staff
dashboard (Menu → edit a dish).
