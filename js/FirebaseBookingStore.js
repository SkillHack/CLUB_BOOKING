// Дополнительный ONLINE-режим. Не запускается без настройки Firebase.

export class FirebaseBookingStore {
  constructor(config) { this.mode = 'online'; this.config = config; }
  async init() {
    const version = '11.10.0';
    const [app, auth, firestore] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
    ]);
    this.f = firestore;
    this.auth = auth.getAuth(app.initializeApp(this.config));
    await new Promise((resolve, reject) => {
      const unsubscribe = auth.onAuthStateChanged(this.auth, () => { unsubscribe(); resolve(); }, reject);
    });
    if (!this.auth.currentUser) await auth.signInAnonymously(this.auth);
    this.ownerId = this.auth.currentUser.uid;
    this.db = firestore.getFirestore();
  }
  slotId(date, machineId, hour) { return `${date}_${machineId}_${hour}`; }
  async getReserved(date) {
    const q = this.f.query(this.f.collection(this.db, 'reservedSlots'), this.f.where('date', '==', date));
    const docs = await this.f.getDocs(q);
    return docs.docs.map(d => ({...d.data(), startHour:d.data().hour, duration:1}));
  }
  async getMine() {
    const q = this.f.query(this.f.collection(this.db, 'bookings'), this.f.where('ownerId','==',this.ownerId));
    const docs = await this.f.getDocs(q);
    return docs.docs.map(d=>d.data());
  }
  async createBooking(data) {
    globalThis.validateClubBooking(data);
    const bookingId = crypto.randomUUID();
    const booking = {...data, id:bookingId, ownerId:this.ownerId, createdAt:Date.now()};
    const slots = Array.from({length:data.duration}, (_,i)=>{
      const hour = data.startHour+i;
      return {hour, ref:this.f.doc(this.db,'reservedSlots',this.slotId(data.date,data.machineId,hour))};
    });
    await this.f.runTransaction(this.db, async transaction => {
      // Одна атомарная операция: либо все часы свободны, либо бронь не создаётся.
      for (const {ref} of slots) {
        const document = await transaction.get(ref);
        if (document.exists()) throw new Error('Выбранный слот уже занят.');
      }
      transaction.set(this.f.doc(this.db,'bookings',bookingId),booking);
      slots.forEach(({hour,ref})=>transaction.set(ref, {bookingId, ownerId:this.ownerId, date:data.date, machineId:data.machineId, hour}));
    });
    return booking;
  }
  async cancelBooking(booking) {
    const batch = this.f.writeBatch(this.db);
    for (let i=0;i<booking.duration;i++) {
      batch.delete(this.f.doc(this.db,'reservedSlots', this.slotId(booking.date,booking.machineId,booking.startHour+i)));
    }
    batch.delete(this.f.doc(this.db,'bookings',booking.id));
    await batch.commit();
  }
  watch(date,onChange) {
    const q = this.f.query(this.f.collection(this.db,'reservedSlots'), this.f.where('date','==',date));
    return this.f.onSnapshot(q,()=>onChange(), error=>console.warn('Realtime availability:',error));
  }
}
