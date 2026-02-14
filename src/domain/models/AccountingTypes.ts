import { Decimal } from '@prisma/client/runtime/library';

export interface JournalLineDTO {
  accountId: string;
  currencyId: string;
  debit: number;
  credit: number;
  exchangeRate: number;
  baseDebit: number;
  baseCredit: number;
}

export interface JournalEntryDTO {
  branchId: string;
  description: string;
  date: Date;
  lines: JournalLineDTO[];
  createdBy: string;
}

export class AccountingValidator {
  static validateBalance(lines: JournalLineDTO[]): boolean {
    const totalBaseDebit = lines.reduce((sum, line) => sum + line.baseDebit, 0);
    const totalBaseCredit = lines.reduce((sum, line) => sum + line.baseCredit, 0);
    
    // Using a small epsilon for decimal comparison if needed, 
    // but the user requirement is strict SUM(baseDebit) = SUM(baseCredit)
    return Math.abs(totalBaseDebit - totalBaseCredit) < 0.0001;
  }

  static validateCurrency(lineCurrencyId: string, accountCurrencyId: string): boolean {
    return lineCurrencyId === accountCurrencyId;
  }
}
