import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
  { path: 'transactions', loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent) },
  { path: 'transactions/:id', loadComponent: () => import('./features/transactions/transaction-detail.component').then((m) => m.TransactionDetailComponent) },
  { path: 'accounts', loadComponent: () => import('./features/accounts/accounts.component').then((m) => m.AccountsComponent) },
  { path: 'accounts/:id', loadComponent: () => import('./features/accounts/account-detail.component').then((m) => m.AccountDetailComponent) },
  { path: 'transfers', loadComponent: () => import('./features/transfers/transfers.component').then((m) => m.TransfersComponent) },
  { path: 'recurrences', loadComponent: () => import('./features/recurrences/recurrences.component').then((m) => m.RecurrencesComponent) },
  { path: 'cards', loadComponent: () => import('./features/cards/cards.component').then((m) => m.CardsComponent) },
  { path: 'cards/:id/invoices/:invoiceId', loadComponent: () => import('./features/cards/card-invoice-detail.component').then((m) => m.CardInvoiceDetailComponent) },
  { path: 'cards/:id', loadComponent: () => import('./features/cards/card-detail.component').then((m) => m.CardDetailComponent) },
  { path: 'categories', loadComponent: () => import('./features/categories/categories.component').then((m) => m.CategoriesComponent) },
  { path: 'budgets', loadComponent: () => import('./features/budgets/budgets.component').then((m) => m.BudgetsComponent) },
  { path: 'goals/:id', loadComponent: () => import('./features/goals/goal-detail.component').then((m) => m.GoalDetailComponent) },
  { path: 'goals', loadComponent: () => import('./features/goals/goals.component').then((m) => m.GoalsComponent) },
  { path: 'import-export', loadComponent: () => import('./features/import-export/import-export.component').then((m) => m.ImportExportComponent) },
  { path: 'reports', loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent) },
  { path: '**', loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent) },
];
