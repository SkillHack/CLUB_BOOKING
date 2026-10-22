// Каталог клуба. Цены и характеристики демонстрационные.
const OPEN_HOUR = 10;
const CLOSE_HOUR = 24;
const BOOKING_DAYS = 7;
const DURATIONS = [1, 2, 3];
const MACHINES = [
  { id: 'PC-01', type: 'STANDARD', price: 200, specs: 'RTX 3060 · 144 Гц' },
  { id: 'PC-02', type: 'STANDARD', price: 200, specs: 'RTX 3060 · 144 Гц' },
  { id: 'PC-03', type: 'STANDARD', price: 200, specs: 'RTX 3060 · 144 Гц' },
  { id: 'PC-04', type: 'STANDARD', price: 200, specs: 'RTX 3060 · 144 Гц' },
  { id: 'PC-05', type: 'PRO', price: 350, specs: 'RTX 4070 · 240 Гц' },
  { id: 'PC-06', type: 'PRO', price: 350, specs: 'RTX 4070 · 240 Гц' },
  { id: 'PC-07', type: 'PRO', price: 350, specs: 'RTX 4070 · 240 Гц' },
  { id: 'PC-08', type: 'VIP', price: 500, specs: 'RTX 4080 · 360 Гц' }
];

function localISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function futureDate(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localISO(date);
}
function formatDate(iso, options = {day:'numeric', month:'long'}) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', options).format(new Date(y, m - 1, d, 12));
}
function formatHour(hour) { return `${String(hour).padStart(2, '0')}:00`; }
function machineById(id) { return MACHINES.find(machine => machine.id === id); }
function safeNickname(value) { return value.trim().replace(/\s+/g,' ').slice(0,32); }
function validDate(date) { return Array.from({length: BOOKING_DAYS}, (_,i)=>futureDate(i)).includes(date); }
function currentHour() { return new Date().getHours(); }
