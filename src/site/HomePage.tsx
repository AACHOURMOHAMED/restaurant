import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { scrollToId } from '@/lib/motion';
import { useMenu } from '@/lib/queries';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AtTable } from './sections/AtTable';
import { Gallery } from './sections/Gallery';
import { Atelier } from './sections/Atelier';
import { Hero } from './sections/Hero';
import { MenuSection } from './sections/MenuSection';
import { Specials } from './sections/Specials';
import { Story } from './sections/Story';
import { Visit } from './sections/Visit';

/** Scrolls to /#section links, again once the menu has loaded (it changes the page height). */
function useHashScroll(menuReady: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => scrollToId(decodeURIComponent(hash.slice(1))), 80);
    return () => window.clearTimeout(id);
  }, [hash, menuReady]);
}

export function HomePage() {
  useDocumentTitle();
  const menu = useMenu();
  useHashScroll(menu.isSuccess);
  return (
    <>
      <Hero />
      <Story />
      <Specials />
      <Atelier />
      <MenuSection />
      <AtTable />
      <Gallery />
      <Visit />
    </>
  );
}
