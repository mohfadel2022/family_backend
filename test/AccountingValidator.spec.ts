import { AccountingValidator, JournalLineDTO } from '../src/domain/models/AccountingTypes';

describe('AccountingValidator', () => {
  describe('validateBalance', () => {
    it('should return true when baseDebit equals baseCredit', () => {
      const lines: JournalLineDTO[] = [
        { accountId: '1', currencyId: '1', debit: 100, credit: 0, exchangeRate: 1, baseDebit: 100, baseCredit: 0 },
        { accountId: '2', currencyId: '1', debit: 0, credit: 100, exchangeRate: 1, baseDebit: 0, baseCredit: 100 }
      ];
      expect(AccountingValidator.validateBalance(lines)).toBe(true);
    });

    it('should return false when baseDebit does not equal baseCredit', () => {
      const lines: JournalLineDTO[] = [
        { accountId: '1', currencyId: '1', debit: 100, credit: 0, exchangeRate: 1, baseDebit: 100, baseCredit: 0 },
        { accountId: '2', currencyId: '1', debit: 0, credit: 90, exchangeRate: 1, baseDebit: 0, baseCredit: 90 }
      ];
      expect(AccountingValidator.validateBalance(lines)).toBe(false);
    });

    it('should return true for multi-currency balanced entry', () => {
      // 100 SAR debit, 26.67 USD credit (at 3.75 rate = 100.0125, let's say exactly 100)
      const lines: JournalLineDTO[] = [
        { accountId: '1', currencyId: 'SAR', debit: 100, credit: 0, exchangeRate: 1, baseDebit: 100, baseCredit: 0 },
        { accountId: '2', currencyId: 'USD', debit: 0, credit: 26.6667, exchangeRate: 3.75, baseDebit: 0, baseCredit: 100 }
      ];
      expect(AccountingValidator.validateBalance(lines)).toBe(true);
    });
  });

  describe('validateCurrency', () => {
    it('should return true when currency IDs match', () => {
      expect(AccountingValidator.validateCurrency('SAR', 'SAR')).toBe(true);
    });

    it('should return false when currency IDs differ', () => {
      expect(AccountingValidator.validateCurrency('SAR', 'USD')).toBe(false);
    });
  });
});
