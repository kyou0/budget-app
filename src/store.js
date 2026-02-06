import { INITIAL_DATA } from './schema.js';

const STORAGE_KEY = 'budget_app_data';

class Store {
  constructor() {
    this.data = this.load();
    this.listeners = [];
  }

  load() {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return INITIAL_DATA;
    try {
      const data = JSON.parse(json);
      return this.migrate(data);
    } catch (e) {
      console.error('Failed to load data', e);
      return INITIAL_DATA;
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    this.notify();
  }

  migrate(data) {
    // 現在はバージョン1のみなので、必要に応じて拡張
    if (!data.schemaVersion) {
      data.schemaVersion = 1;
    }
    return data;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(l => l(this.data));
  }

  // Master CRUD
  addMasterItem(item) {
    const newItem = { ...item, id: crypto.randomUUID(), active: true };
    this.data.master.items.push(newItem);
    this.save();
  }

  updateMasterItem(id, updates) {
    const index = this.data.master.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data.master.items[index] = { ...this.data.master.items[index], ...updates };
      this.save();
    }
  }

  // Loan CRUD
  addLoan(loan) {
    const newLoan = { ...loan, id: crypto.randomUUID(), active: true };
    this.data.master.loans.push(newLoan);
    this.save();
  }

  updateLoan(id, updates) {
    const index = this.data.master.loans.findIndex(l => l.id === id);
    if (index !== -1) {
      this.data.master.loans[index] = { ...this.data.master.loans[index], ...updates };
      this.save();
    }
  }

  // Calendar Event Updates
  updateEvent(yearMonth, eventId, updates) {
    const monthEvents = this.data.calendar.generatedMonths[yearMonth];
    if (monthEvents) {
      const index = monthEvents.findIndex(e => e.id === eventId);
      if (index !== -1) {
        monthEvents[index] = { ...monthEvents[index], ...updates };
        this.save();
      }
    }
  }

  addMonthEvents(yearMonth, events) {
    this.data.calendar.generatedMonths[yearMonth] = events;
    this.save();
  }

  updateSettings(updates) {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
  }
}

export const store = new Store();
