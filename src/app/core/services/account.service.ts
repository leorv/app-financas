import { Injectable, computed } from '@angular/core';
import { Account, AccountType } from '../domain/models';
import { createId, normalizeName } from '../domain/ids';
import { utcNow } from '../domain/civil-date';
import { calculateAccountBalance } from '../domain/account-balance';
import { PersistenceService } from '../persistence/persistence.service';

export interface AccountInput {
  name: string;
  type: AccountType;
  institution: string;
  color: string;
  icon: string;
  initialBalanceCents: number;
  isDefault: boolean;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly accounts = computed(() => this.persistence.snapshot().accounts);
  readonly activeAccounts = computed(() => this.accounts().filter((account) => !account.archived));
  readonly defaultAccountId = computed(() => this.activeAccounts().find((account) => account.isDefault)?.id ?? this.activeAccounts()[0]?.id ?? null);

  constructor(private readonly persistence: PersistenceService) {}

  balance(account: Account): number {
    return calculateAccountBalance(account, this.persistence.snapshot().transactions);
  }

  async create(input: AccountInput): Promise<Account> {
    const nameError = this.validateName(input.name);
    if (nameError) {
      throw new Error(nameError);
    }
    this.assertInitialBalance(input.initialBalanceCents);
    const now = utcNow();
    const account: Account = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      archived: false,
      name: input.name.trim(),
      normalizedName: normalizeName(input.name),
      type: input.type,
      institution: input.institution.trim() || null,
      color: input.color,
      icon: input.icon,
      initialBalanceCents: input.initialBalanceCents,
      isDefault: input.isDefault,
    };
    await this.persist((current) => {
      const mustBeDefault = input.isDefault || current.filter((item) => !item.archived).length === 0;
      const accounts = mustBeDefault ? current.map((item) => ({ ...item, isDefault: false })) : [...current];
      return [...accounts, { ...account, isDefault: mustBeDefault }];
    });
    return this.accounts().find((item) => item.id === account.id) ?? account;
  }

  async update(id: string, input: AccountInput): Promise<Account> {
    const current = this.accounts().find((account) => account.id === id);
    if (!current) {
      throw new Error('Conta não encontrada.');
    }
    const nameError = this.validateName(input.name, id);
    if (nameError) {
      throw new Error(nameError);
    }
    this.assertInitialBalance(input.initialBalanceCents);
    const now = utcNow();
    const updated: Account = {
      ...current,
      name: input.name.trim(),
      normalizedName: normalizeName(input.name),
      type: input.type,
      institution: input.institution.trim() || null,
      color: input.color,
      icon: input.icon,
      initialBalanceCents: input.initialBalanceCents,
      isDefault: input.isDefault && !current.archived,
      updatedAt: now,
    };
    await this.persist((latest) => {
      let accounts = latest.map((item) => item.id === id ? updated : item);
      if (updated.isDefault) {
        accounts = accounts.map((item) => item.id === id ? item : { ...item, isDefault: false });
      }
      return this.ensureDefault(accounts);
    });
    return updated;
  }

  async setDefault(id: string): Promise<void> {
    const target = this.accounts().find((account) => account.id === id);
    if (!target || target.archived) {
      throw new Error('Somente uma conta ativa pode ser a padrão.');
    }
    await this.persist((current) => current.map((account) => ({ ...account, isDefault: account.id === id, updatedAt: utcNow() })));
  }

  async archive(id: string): Promise<void> {
    const target = this.accounts().find((account) => account.id === id);
    if (!target) {
      throw new Error('Conta não encontrada.');
    }
    await this.persist((current) => this.ensureDefault(current.map((account) => account.id === id ? { ...account, archived: true, isDefault: false, updatedAt: utcNow() } : account)));
  }

  async reactivate(id: string): Promise<void> {
    const target = this.accounts().find((account) => account.id === id);
    if (!target) {
      throw new Error('Conta não encontrada.');
    }
    await this.persist((current) => this.ensureDefault(current.map((account) => account.id === id ? { ...account, archived: false, updatedAt: utcNow() } : account)));
  }

  private validateName(name: string, ignoredId?: string): string | null {
    const normalized = normalizeName(name);
    if (!normalized) {
      return 'Informe o nome da conta.';
    }
    if (this.accounts().some((account) => account.id !== ignoredId && !account.archived && account.normalizedName === normalized)) {
      return 'Já existe uma conta ativa com esse nome.';
    }
    return null;
  }

  private ensureDefault(accounts: readonly Account[]): Account[] {
    const active = accounts.filter((account) => !account.archived);
    if (active.some((account) => account.isDefault)) {
      const firstDefault = active.find((account) => account.isDefault)?.id;
      return accounts.map((account) => ({ ...account, isDefault: account.id === firstDefault }));
    }
    const firstActive = active[0]?.id;
    return accounts.map((account) => ({ ...account, isDefault: account.id === firstActive }));
  }

  private assertInitialBalance(cents: number): void {
    if (!Number.isSafeInteger(cents)) {
      throw new Error('O saldo inicial deve ser informado em centavos inteiros.');
    }
  }

  private async persist(mutator: (current: readonly Account[]) => readonly Account[]): Promise<void> {
    const saved = await this.persistence.update((current) => ({ ...current, accounts: mutator(current.accounts) }));
    if (!saved) {
      throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a conta.');
    }
  }
}
