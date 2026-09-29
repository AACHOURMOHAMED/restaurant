# Photos

Put B&B Park's own photos here (JPEG, PNG, WebP or AVIF — the larger the better,
ideally at least 2400 px wide for the hero). Then reference them by file name in
`content/restaurant.ts`, for example:

```ts
hero: { …, photo: 'salle-terrasse.jpg' },
story: { …, photo: 'chef-en-cuisine.jpg' },
gallery: [
  { photo: 'plateau-fruits-de-mer.jpg', alt: { fr: 'Plateau de fruits de mer', en: 'Seafood platter' } },
],
```

`npm run dev` / `npm run build` generate optimised responsive versions
automatically (AVIF, WebP and JPEG in `public/photos/`). Until real photos are
added, the site shows elegant placeholders — it never uses stock photos.

Dish photos are uploaded directly from the staff dashboard (Menu → edit a dish).
