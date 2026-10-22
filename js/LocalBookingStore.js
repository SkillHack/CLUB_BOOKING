
const STORAGE_KEY = 'skillhack-club-bookings-v1';
const USER_KEY = 'skillhack-club-owner-v1';

// crypto.randomUUID бывает недоступен на обычном http:// и в некоторых file://-режимах.
function newBookingId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `booking-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}


class LocalBookingStore {
  constructor() {
    this.mode = 'demo';
    this.memory = []; // запасной вариант, если localStorage заблокирован браузером
    this.temporary = false;
    try {
      this.ownerId = localStorage.getItem(USER_KEY) || newBookingId();
      localStorage.setItem(USER_KEY, this.ownerId);
    } catch {
      this.ownerId = 'browser-owner';
    }
  }
  async init() {}

  read() {
    if (this.temporary) return this.memory;
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return this.memory; }
  }
  write(bookings) {
    this.memory = bookings;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings)); }
    catch { this.temporary = true; this.mode = 'temporary'; /* память вкладки вместо localStorage */ }
  }
  // Несколько занятых слотов для демонстрации — одинаковы при каждом открытии.
  seed(date) {
    if (!validDate(date)) return [];
    return [
      {id: 'sample-01', date, machineId: 'PC-02', startHour: 18, duration: 2, sample: true},
      {id: 'sample-02', date, machineId: 'PC-05', startHour: 15, duration: 2, sample: true},
      {id: 'sample-03', date, machineId: 'PC-08', startHour: 20, duration: 1, sample: true}
    ];
  }
  async getReserved(date) { return [...this.seed(date), ...this.read().filter(b => b.date === date)]; }
  async getMine() { return this.read().filter(b => b.ownerId === this.ownerId); }
  async createBooking(data) {
    validateBooking(data);
    // Синхронно перечитываем хранилище прямо перед записью.
    const all = this.read();
    const slots = [...this.seed(data.date), ...all.filter(b=>b.date===data.date)];
    if (slots.some(b => b.machineId === data.machineId && overlap(b, data))) {
      throw new Error('Этот интервал уже занят. Выбери другое время.');
    }
    const booking = { ...data, id: newBookingId(), ownerId: this.ownerId, createdAt: Date.now() };
    this.write([...all, booking]);
    return booking;
  }
  async cancelBooking(booking) {
    const all = this.read();
    const existing = all.find(b => b.id === booking.id && b.ownerId === this.ownerId);
    if (!existing) throw new Error('Бронирование не найдено.');
    this.write(all.filter(b => b.id !== booking.id));
  }
  watch(date, onChange) {
    const handler = event => { if (event.key === STORAGE_KEY) onChange(); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}

function overlap(a,b) { return a.startHour < b.startHour+b.duration && b.startHour < a.startHour+a.duration; }
function validateBooking(data) {
  const nickname = safeNickname(data.nickname || '');
  if (nickname.length < 2) throw new Error('Никнейм должен содержать минимум 2 символа.');
  if (!validDate(data.date)) throw new Error(`Бронирование доступно на ближайшие ${BOOKING_DAYS} дней.`);
  if (!machineById(data.machineId)) throw new Error('Выбери компьютер.');
  if (![1,2,3].includes(data.duration) || !Number.isInteger(data.startHour) || data.startHour < OPEN_HOUR || data.startHour + data.duration > CLOSE_HOUR) {
    throw new Error('Выбери доступные часы и длительность.');
  }
  if (data.date === futureDate(0) && data.startHour <= new Date().getHours()) {
    throw new Error('Это время уже прошло. Выбери более поздний сеанс.');
  }
}

// Для необязательного модуля Firestore: та же проверка данных при онлайн-записи.
globalThis.validateClubBooking = validateBooking;
