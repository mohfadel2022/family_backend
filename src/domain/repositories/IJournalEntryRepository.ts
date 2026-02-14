import { JournalEntryDTO } from '../models/AccountingTypes';

export interface IJournalEntryRepository {
  create(entry: JournalEntryDTO): Promise<any>;
  findById(id: string): Promise<any>;
  findByBranch(branchId: string): Promise<any[]>;
  postEntry(id: string): Promise<void>;
}
