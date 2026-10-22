
const $ = selector => document.querySelector(selector);
const elements = {
  dates: $('#date-picker'), pcs: $('#pc-grid'), slots: $('#slot-grid'), durations: $('#duration-tabs'),
  date: $('#summary-date'), pc: $('#summary-pc'), time: $('#summary-time'), duration: $('#summary-duration'),
  price: $('#summary-price'), reserve: $('#reserve-button'), form: $('#booking-form'),
  nickname: $('#nickname'), error: $('#form-error'), toast: $('#toast'),
  bookings: $('#my-bookings-list'), mode: $('#mode-badge'), hint: $('#storage-hint'),
  refresh: $('#refresh-bookings'), dialog: $('#confirmation'), dialogText: $('#confirmation-text')
};
const selection = { date: futureDate(0), machineId: 'PC-06', duration: 2, hour: null };
let busyBookings = [];
let mine = [];
let store;
let unsubscribe = null;
let loading = true;
let saving = false;
let toastTimer;
let loadVersion = 0;

const yearElement = $('#year');
if (yearElement) yearElement.textContent = new Date().getFullYear();

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function money(amount) { return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'; }
function notify(text) {
  elements.toast.textContent = text;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 3500);
}
function isBusy(machineId, hour, duration) {
  return busyBookings.some(b => b.machineId === machineId && b.startHour < hour + duration && hour < b.startHour + b.duration);
}
function isPast(hour) {
  return selection.date === localISO() && hour <= new Date().getHours();
}
function canSelectHour(hour) {
  return !loading && hour + selection.duration <= CLOSE_HOUR && !isBusy(selection.machineId, hour, selection.duration) && !isPast(hour);
}
function renderDates() {
  elements.dates.innerHTML = Array.from({length:BOOKING_DAYS}, (_, i) => {
    const date = futureDate(i);
    const day = new Date(`${date}T12:00:00`);
    const weekday = i === 0 ? 'СЕГ' : i === 1 ? 'ЗАВ' : new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(day).replace('.','').toUpperCase();
    return `<button type="button" class="date-button" aria-pressed="${selection.date === date}" data-date="${date}" aria-label="${formatDate(date, {weekday:'long',day:'numeric',month:'long'})}"><small>${weekday}</small><strong>${day.getDate()}</strong><small>${new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(day).toUpperCase().replace('.','')}</small></button>`;
  }).join('');
}
function renderStations() {
  elements.pcs.innerHTML = MACHINES.map(machine => `<button type="button" class="station-card ${machine.type.toLowerCase()}" data-machine="${machine.id}" aria-pressed="${selection.machineId === machine.id}" aria-label="${machine.id}, ${machine.type}, ${machine.price} рублей в час, ${machine.specs}"><span class="pc-icon" aria-hidden="true">▣</span><strong>${machine.id}</strong><span class="pc-type">${machine.type}</span><span class="pc-price">${money(machine.price)} / ч</span></button>`).join('');
}
function renderDurations() {
  elements.durations.querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === selection.duration));
  });
}
function renderTimes() {
  let selectable = 0;
  elements.slots.innerHTML = Array.from({length:CLOSE_HOUR-OPEN_HOUR}, (_,i) => {
    const hour = OPEN_HOUR + i;
    const valid = canSelectHour(hour);
    if (valid) selectable++;
    const hint = !valid ? (isPast(hour) ? 'время прошло' : 'занято или не помещается до закрытия') : 'свободно';
    return `<button class="slot-button" type="button" data-hour="${hour}" aria-pressed="${selection.hour === hour}" aria-label="${formatHour(hour)}, ${hint}" ${valid ? '' : 'disabled'}>${formatHour(hour)}</button>`;
  }).join('');
  $('#slots-note').innerHTML = loading ? 'Загружаем доступные часы…' : selectable === 0 ? 'Свободных интервалов нет. Попробуй другой день или компьютер.' : '<span class="legend-dot available"></span> свободно <span class="legend-dot busy"></span> занято <span class="legend-dot chosen"></span> выбрано';
}
function renderSummary() {
  const pc = machineById(selection.machineId);
  elements.pc.textContent = `${pc.id} / ${pc.type}`;
  elements.date.textContent = formatDate(selection.date);
  elements.duration.textContent = `${selection.duration} ${selection.duration === 1 ? 'час' : 'часа'}`;
  elements.time.textContent = selection.hour === null ? 'Не выбрано' : `${formatHour(selection.hour)} — ${formatHour(selection.hour + selection.duration)}`;
  elements.price.textContent = money(pc.price * selection.duration);
  elements.reserve.disabled = loading || saving || selection.hour === null || !canSelectHour(selection.hour);
  elements.reserve.firstChild.textContent = saving ? 'СОХРАНЯЕМ… ' : 'ЗАБРОНИРОВАТЬ ';
}
function render() { renderDates(); renderStations(); renderDurations(); renderTimes(); renderSummary(); }

function renderBookings() {
  const active = mine.filter(b=>b.date >= futureDate(0)).sort((a,b)=>a.date.localeCompare(b.date) || a.startHour-b.startHour);
  if (!active.length) {
    elements.bookings.innerHTML = '<div class="empty-bookings">Пока нет активных бронирований. Самое время занять место.</div>';
    return;
  }
  elements.bookings.innerHTML = active.map(booking => {
    const pc = machineById(booking.machineId);
    return `<article class="booking-ticket"><div><span class="ticket-label">● БРОНЬ ПОДТВЕРЖДЕНА</span><h3>${escapeHTML(booking.machineId)} / ${escapeHTML(pc?.type || '')}</h3><p>${formatDate(booking.date,{weekday:'long', day:'numeric', month:'long'})} · ${formatHour(booking.startHour)}—${formatHour(booking.startHour+booking.duration)}</p><small>Игрок: ${escapeHTML(booking.nickname)}</small></div><div class="ticket-right"><strong>${money((pc?.price || 0)*booking.duration)}</strong><button type="button" data-cancel="${escapeHTML(booking.id)}">ОТМЕНИТЬ ×</button></div></article>`;
  }).join('');
}

async function refreshAvailability() {
  const version = ++loadVersion;
  loading = true;
  renderTimes(); renderSummary();
  try {
    const results = await store.getReserved(selection.date);
    if (version !== loadVersion) return;
    busyBookings = results;
    loading = false;
    if (selection.hour !== null && !canSelectHour(selection.hour)) selection.hour = null;
    renderTimes(); renderSummary();
  } catch (error) {
    if (version !== loadVersion) return;
    busyBookings = [];
    loading = true;
    renderTimes(); renderSummary();
    if (elements.hint) elements.hint.textContent = `Ошибка загрузки свободного времени: ${error.message}`;
    notify('Не удалось обновить расписание');
  }
}
async function refreshMine() {
  try { mine = await store.getMine(); renderBookings(); }
  catch (error) { notify(`Ошибка списка бронирований: ${error.message}`); }
}
function startWatching(date) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  unsubscribe = store.watch(date, () => { refreshAvailability(); refreshMine(); });
}

// Один делегированный обработчик для всех кнопок выбора даты.
elements.dates.addEventListener('click', async event => {
  const button = event.target.closest('[data-date]');
  if (!button || saving) return;
  selection.date = button.dataset.date;
  selection.hour = null;
  render();
  startWatching(selection.date);
  await refreshAvailability();
});
elements.pcs.addEventListener('click', event => {
  const button = event.target.closest('[data-machine]');
  if (!button || saving) return;
  selection.machineId = button.dataset.machine;
  if (selection.hour !== null && !canSelectHour(selection.hour)) selection.hour = null;
  render();
});
elements.durations.addEventListener('click', event => {
  const button = event.target.closest('[data-duration]');
  if (!button || saving) return;
  selection.duration = Number(button.dataset.duration);
  if (selection.hour !== null && !canSelectHour(selection.hour)) selection.hour = null;
  render();
});
elements.slots.addEventListener('click', event => {
  const button = event.target.closest('[data-hour]');
  if (!button || button.disabled || saving) return;
  const hour = Number(button.dataset.hour);
  if (!canSelectHour(hour)) return;
  selection.hour = hour;
  elements.error.textContent = '';
  renderTimes(); renderSummary();
});

elements.form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || loading) return;
  const nickname = safeNickname(elements.nickname.value);
  if (nickname.length < 2) { elements.error.textContent = 'Укажи никнейм (минимум 2 символа).'; elements.nickname.focus(); return; }
  if (selection.hour === null || !canSelectHour(selection.hour)) { elements.error.textContent = 'Выбери доступный интервал времени.'; return; }
  const payload = { date:selection.date, machineId:selection.machineId, startHour:selection.hour, duration:selection.duration, nickname };
  elements.error.textContent = '';
  saving = true; renderSummary();
  try {
    const booking = await store.createBooking(payload);
    const pc = machineById(booking.machineId);
    elements.dialogText.textContent = `${booking.nickname}, ${booking.machineId} забронирован на ${formatDate(booking.date)} с ${formatHour(booking.startHour)} до ${formatHour(booking.startHour+booking.duration)}. Стоимость: ${money(pc.price*booking.duration)}.`;
    elements.dialog.showModal();
    selection.hour = null;
    await Promise.all([refreshAvailability(), refreshMine()]);
  } catch (error) {
    elements.error.textContent = error.message || 'Ошибка бронирования. Попробуй снова.';
    notify('Бронь не создана. Обнови расписание.');
    await refreshAvailability();
  } finally { saving = false; renderSummary(); }
});
elements.bookings.addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel]');
  if (!button || button.disabled) return;
  const booking = mine.find(b => b.id === button.dataset.cancel);
  if (!booking || !confirm(`Отменить бронь ${booking.machineId} на ${formatDate(booking.date)} в ${formatHour(booking.startHour)}?`)) return;
  button.disabled = true;
  try { await store.cancelBooking(booking); await Promise.all([refreshAvailability(),refreshMine()]); notify('Бронирование отменено.'); }
  catch (error) { button.disabled = false; notify(`Не удалось отменить бронь: ${error.message}`); }
});
elements.refresh.addEventListener('click', () => Promise.all([refreshAvailability(),refreshMine()]));
$('#confirmation-close').addEventListener('click', () => elements.dialog.close());
elements.nickname.addEventListener('input',()=>{elements.error.textContent='';});

async function init() {
  render();
  try {
    if (firebaseSettings.enabled) {
      if (location.protocol === 'file:') throw new Error('Для онлайн-базы Firebase запусти сайт через Live Server или GitHub Pages.');
      const { FirebaseBookingStore } = await import('./FirebaseBookingStore.js');
      store = new FirebaseBookingStore(firebaseSettings.config);
    } else store = new LocalBookingStore();
    await store.init();
    if (elements.mode) {
      elements.mode.textContent = store.mode === 'online' ? '● ONLINE / ОБЩАЯ БАЗА' : '● DEMO / ЭТОТ БРАУЗЕР';
      elements.mode.classList.toggle('live',store.mode==='online');
    }
    if (elements.hint) {
      elements.hint.textContent = store.mode === 'online'
        ? 'Онлайн-база: занятые часы видны всем посетителям. Отмена доступна владельцу брони.'
        : 'Демо-режим: брони хранятся только в этом браузере. Для общей базы смотри README.';
    }
    await Promise.all([refreshAvailability(), refreshMine()]);
    startWatching(selection.date);
  } catch (error) {
    console.error('Booking system initialization failed', error);
    if (elements.mode) elements.mode.textContent = '⚠ ОШИБКА ПОДКЛЮЧЕНИЯ';
    if (elements.hint) elements.hint.textContent = `Сервис недоступен: ${error.message}. Проверь конфигурацию или включи демо-режим.`;
    notify('Не удалось запустить бронирование');
  }
}
init();
