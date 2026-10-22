// Без npm: проверяем хранилище и общие функции из обычных браузерных JS-файлов.
// node tests/booking-store.test.mjs
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const values = new Map();
const sandbox = {
  Date, Math, Intl, crypto: webcrypto,
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  },
  addEventListener() {}, removeEventListener() {}
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['js/data.js', 'js/LocalBookingStore.js']) {
  vm.runInContext(readFileSync(resolve(base, file), 'utf8'), sandbox, { filename: file });
}
const { LocalBookingStore, futureDate } = vm.runInContext('({LocalBookingStore, futureDate})', sandbox);

const store = new LocalBookingStore();
const date = futureDate(1);
const request = { date, machineId: 'PC-06', startHour: 18, duration: 2, nickname: 'SKILLHACK' };
const reservation = await store.createBooking(request);
assert.equal((await store.getMine()).length, 1);
await assert.rejects(() => store.createBooking({ ...request, startHour: 17 }), /занят/);
await assert.rejects(() => store.createBooking({ ...request, machineId: 'PC-02' }), /занят/);
assert.equal((await store.getReserved(date)).filter(b => b.machineId === 'PC-06').length, 1);
const nextStore = new LocalBookingStore();
assert.equal((await nextStore.getMine()).length, 1, 'Бронирование не сохранилось в localStorage');
await nextStore.cancelBooking(reservation);
assert.equal((await nextStore.getMine()).length, 0);
const newBooking = await store.createBooking(request);
assert.notEqual(newBooking.id, reservation.id);
console.log('OK: создание, пересечение, занятые слоты, сохранение, отмена и повторная бронь');
