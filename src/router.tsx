import { createBrowserRouter } from 'react-router';
import { DineInLayout } from './dinein/DineInLayout';
import { HomePage } from './site/HomePage';
import { NotFoundPage, RouteError } from './site/NotFound';
import { SiteLayout } from './site/SiteLayout';

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'reservation', lazy: page(() => import('./reserve/ReservePage')) },
      { path: 'reservation/:token', lazy: page(() => import('./reserve/ReservationStatusPage')) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <DineInLayout />,
    errorElement: <RouteError />,
    children: [
      { path: 'table', lazy: page(() => import('./dinein/TablePage')) },
      { path: 't/:code', lazy: page(() => import('./dinein/TableQrPage')) },
      { path: 'order', lazy: page(() => import('./dinein/OrderPage')) },
      { path: 'order/:token', lazy: page(() => import('./dinein/OrderStatusPage')) },
    ],
  },
  {
    path: 'staff',
    lazy: page(() => import('./staff/StaffApp')),
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import('./staff/ReservationsPage')) },
      { path: 'orders', lazy: page(() => import('./staff/OrdersPage')) },
      { path: 'tables', lazy: page(() => import('./staff/TablesPage')) },
      { path: 'menu', lazy: page(() => import('./staff/MenuPage')) },
      { path: 'settings', lazy: page(() => import('./staff/SettingsPage')) },
      { path: 'team', lazy: page(() => import('./staff/TeamPage')) },
    ],
  },
  { path: 'staff/login', lazy: page(() => import('./staff/LoginPage')) },
  { path: 'staff/tables/print', lazy: page(() => import('./staff/QrPrintPage')) },
]);
