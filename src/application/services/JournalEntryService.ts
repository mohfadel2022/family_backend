import { PrismaJournalEntryRepository } from '../../infrastructure/repositories/PrismaJournalEntryRepository';
import { JournalEntryDTO } from '../../domain/models/AccountingTypes';

export class JournalEntryService {
  private repository: PrismaJournalEntryRepository;

  constructor() {
    this.repository = new PrismaJournalEntryRepository();
  }

  async createDraft(data: JournalEntryDTO) {
    return this.repository.create(data);
  }

  async getEntries(branchId?: string) {
    return this.repository.findAll(branchId);
  }

  async getEntryById(id: string) {
    return this.repository.findById(id);
  }

  async updateEntry(id: string, data: JournalEntryDTO) {
    return this.repository.update(id, data);
  }

  async deleteEntry(id: string) {
    return this.repository.delete(id);
  }

  async postEntry(id: string, userId: string) {
    return this.repository.postEntry(id, userId);
  }

  async unpostEntry(id: string, userId: string) {
    return this.repository.unpostEntry(id, userId);
  }
}
