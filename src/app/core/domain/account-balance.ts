import { Account, Transaction } from './models';

export function calculateAccountBalance(account: Account, transactions: readonly Transaction[]): number {
  return transactions
    .filter((transaction) => !transaction.archived && transaction.status === 'paid')
    .reduce((balance, transaction) => {
      if (transaction.type === 'income' && transaction.accountId === account.id) {
        return balance + transaction.amountCents;
      }
      if (transaction.type === 'expense' && transaction.accountId === account.id) {
        return balance - transaction.amountCents;
      }
      if (transaction.type === 'transfer' && transaction.fromAccountId === account.id) {
        return balance - transaction.amountCents;
      }
      if (transaction.type === 'transfer' && transaction.toAccountId === account.id) {
        return balance + transaction.amountCents;
      }
      return balance;
    }, account.initialBalanceCents);
}
