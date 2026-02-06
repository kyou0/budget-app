import { store } from '../store.js';
import { googleAuth } from '../auth/googleAuth.js';

export const calendarSync = {
  async syncMonthEvents(yearMonth) {
    try {
      const token = await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
      const events = store.data.calendar.generatedMonths[yearMonth];
      if (!events) return;

      for (const event of events) {
        if (!event.gcalEventId) {
          const gcalEvent = await this.createEvent(token, event);
          store.updateEvent(yearMonth, event.id, { gcalEventId: gcalEvent.id });
        } else {
          await this.updateEvent(token, event);
        }
      }
      console.log(`Calendar sync completed for ${yearMonth}`);
    } catch (err) {
      console.error('Calendar sync error:', err);
      throw err;
    }
  },

  async createEvent(token, event) {
    const gcalEvent = {
      summary: `${event.type === 'income' ? '💰' : '💸'} ${event.name}`,
      description: `Budget App Event ID: ${event.id}\nAmount: ${event.amount}`,
      start: { date: event.originalDate },
      end: { date: event.originalDate },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 * 3 }, // 3日前
          { method: 'popup', minutes: 9 * 60 }        // 当日朝9時 (1440 - 540 = 900 min before? No, simpler to just use minutes)
        ]
      }
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gcalEvent)
    });

    if (!response.ok) throw new Error('Failed to create Google Calendar event');
    return await response.json();
  },

  async updateEvent(token, event) {
    if (!event.gcalEventId) return;

    const gcalEvent = {
      summary: `${event.status === 'paid' ? '✅' : (event.type === 'income' ? '💰' : '💸')} ${event.name}`,
      description: `Budget App Event ID: ${event.id}\nAmount: ${event.amount}\nStatus: ${event.status}`,
      start: { date: event.actualDate || event.originalDate },
      end: { date: event.actualDate || event.originalDate }
    };

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.gcalEventId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gcalEvent)
    });

    if (!response.ok) {
      console.warn('Failed to update Google Calendar event', event.gcalEventId);
      // イベントが削除されている可能性もあるため、IDをクリアして再作成を促すなどの処理も検討
    }
  }
};
