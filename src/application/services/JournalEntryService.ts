import { PrismaJournalEntryRepository } from '../../infrastructure/repositories/PrismaJournalEntryRepository';
import { JournalEntryDTO } from '../../domain/models/AccountingTypes';

export class JournalEntryService {
  private repository: PrismaJournalEntryRepository;

  constructor() {
    this.repository = new PrismaJournalEntryRepository();
  }

  async createDraft(user: { id: string, role: string }, data: JournalEntryDTO) {
    return this.repository.create(user, data);
  }

  async getEntries(user: { id: string, role: string }, branchId?: string, type?: string) {
    return this.repository.findAll(user, branchId, type);
  }

  async getEntryById(user: { id: string, role: string }, id: string) {
    return this.repository.findById(user, id);
  }

  async updateEntry(user: { id: string, role: string }, id: string, data: JournalEntryDTO) {
    return this.repository.update(user, id, data);
  }

  async deleteEntry(user: { id: string, role: string }, id: string) {
    return this.repository.delete(user, id);
  }

  async postEntry(user: { id: string, role: string }, id: string) {
    return this.repository.postEntry(user, id);
  }

  async unpostEntry(user: { id: string, role: string }, id: string) {
    return this.repository.unpostEntry(user, id);
  }
}
