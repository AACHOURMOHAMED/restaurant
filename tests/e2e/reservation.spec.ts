import { expect, test, type Page } from '@playwright/test';
import type { BookingSettings } from '../../shared/availability';
import type { StaffReservation, StaffSettings } from '../../shared/api-types';
import { bookableDates, expectNoHorizontalOverflow, staff, trackErrors, uniquePhone } from './helpers';

/** Picks the second bookable date (or the first) and its first free time; returns both. */
async function pickDateAndTime(page: Page, dates: string[]) {
  const date = dates[1] ?? dates[0]!;
  await page.getByRole('radio', { name: date, exact: true }).check();
  const slot = page.getByRole('radio', { name: /^\d{2}:\d{2}$/ }).first();
  await expect(slot).toBeVisible();
  await slot.check();
  return { date, time: (await slot.getAttribute('value'))! };
}

test.describe('Reserve from a phone — no QR code, no account', () => {
  test('books from the home page and shows "awaiting confirmation" until staff confirm', async ({ page, request }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Réserver une table' }).first().click();
    await expect(page).toHaveURL(/\/reservation$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Réserver une table' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Past dates are never offered.
    const { today } = (await (await request.get('/api/public/site')).json()) as { today: string };
    const offered = await page.locator('[data-date]').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')!));
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((d) => d >= today)).toBe(true);

    await page.getByRole('button', { name: 'Une personne de plus' }).click();
    await expect(page.getByText('3 personnes', { exact: true })).toBeVisible();
    const { date, time } = await pickDateAndTime(page, await bookableDates(request, 3));

    // Client-side validation (the server validates again).
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByText('Indiquez votre nom.')).toBeVisible();
    await expect(page.getByText('Indiquez votre numéro de téléphone.')).toBeVisible();
    await page.getByLabel('Nom complet').fill('Nadia Test');
    await page.getByLabel('Téléphone').fill('12');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByText('Numéro de téléphone invalide.')).toBeVisible();

    const phone = uniquePhone();
    await page.getByLabel('Téléphone').fill(phone);
    await page.getByLabel(/Demandes particulières/).fill('Anniversaire');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();

    await expect(page).toHaveURL(/\/reservation\/[\w-]{20,}$/);
    await expect(page.getByRole('heading', { name: 'Demande de réservation reçue — en attente de confirmation' })).toBeVisible();
    await expect(page.getByTestId('reservation-status')).toContainText('En attente de confirmation');
    await expect(page.getByText('Réservation confirmée')).toHaveCount(0);

    // Staff confirm (and see the guest's contact details); the guest's page reflects it.
    const api = await staff(request);
    const { reservations } = await api.get<{ reservations: StaffReservation[] }>(`/api/staff/reservations?date=${date}`);
    const mine = reservations.find((r) => r.phone === phone)!;
    expect(mine).toMatchObject({ name: 'Nadia Test', partySize: 3, time, notes: 'Anniversaire', status: 'pending' });
    await api.patch(`/api/staff/reservations/${mine.id}`, { status: 'confirmed' });
    await page.reload();
    await expect(page.getByTestId('reservation-status')).toContainText('Confirmée');
    expect(errors).toEqual([]);
  });

  test('shows "Reservation confirmed" only when the booking system confirms it', async ({ page, request }) => {
    const api = await staff(request);
    const { booking } = await api.get<StaffSettings>('/api/staff/settings');
    await api.put<BookingSettings>('/api/staff/settings/booking', { ...booking, requireApproval: false });
    try {
      await page.goto('/reservation');
      await pickDateAndTime(page, await bookableDates(request, 2));
      await page.getByLabel('Nom complet').fill('Omar Instant');
      await page.getByLabel('Téléphone').fill(uniquePhone());
      await page.getByRole('button', { name: 'Confirmer la réservation' }).click();
      await expect(page.getByRole('heading', { name: 'Réservation confirmée' })).toBeVisible();
      await expect(page.getByTestId('reservation-status')).toContainText('Confirmée');
      await expect(page.getByRole('button', { name: 'Ajouter à mon agenda' })).toBeVisible();
    } finally {
      await api.put('/api/staff/settings/booking', booking);
    }
  });

  test('repeated taps on "send" create a single reservation', async ({ page, request }) => {
    await page.goto('/reservation');
    const { date } = await pickDateAndTime(page, await bookableDates(request, 2));
    const phone = uniquePhone();
    await page.getByLabel('Nom complet').fill('Double Tap');
    await page.getByLabel('Téléphone').fill(phone);
    const submit = page.getByRole('button', { name: 'Envoyer la demande' });
    await submit.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
      b.click();
    });
    await expect(page).toHaveURL(/\/reservation\/[\w-]{20,}$/);
    const api = await staff(request);
    const { reservations } = await api.get<{ reservations: StaffReservation[] }>(`/api/staff/reservations?date=${date}`);
    expect(reservations.filter((r) => r.phone === phone)).toHaveLength(1);
  });

  test('the guest can cancel from the status link', async ({ page, request }) => {
    await page.goto('/reservation');
    await pickDateAndTime(page, await bookableDates(request, 2));
    await page.getByLabel('Nom complet').fill('Leila Cancel');
    await page.getByLabel('Téléphone').fill(uniquePhone());
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByTestId('reservation-status')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler la réservation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Oui, annuler' }).click();
    await expect(page.getByTestId('reservation-status')).toContainText('Annulée');
  });
});
