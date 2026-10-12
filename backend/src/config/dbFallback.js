const { EventEmitter } = require('events');

class MemoryDb {
  constructor() {
    this.initDefaultUsers();
    this.centres = [
      { id: 1, name: 'Burdwan Central Procurement Centre', code: 'BDW-01', district: 'Burdwan', state: 'West Bengal', capacity: 500, is_active: true },
      { id: 2, name: 'Durgapur Sub-Division Procurement Centre', code: 'DGP-01', district: 'Paschim Bardhaman', state: 'West Bengal', capacity: 400, is_active: true },
    ];
    this.initDefaultSlotsAndBookings();
  }

  initDefaultUsers() {
    this.users = [
      { id: 1, name: 'Ramesh Kumar', phone: '9876543210', role: 'FARMER', password_hash: 'mock_hash_password123', created_at: new Date() },
      { id: 2, name: 'Suresh Sharma', phone: '9876543211', role: 'OFFICER', password_hash: 'mock_hash_password123', created_at: new Date() },
      { id: 3, name: 'Anita Roy', phone: '9876543212', role: 'ADMIN', password_hash: 'mock_hash_password123', created_at: new Date() },
      { id: 4, name: 'Harish Patel', phone: '9876543213', role: 'FARMER', password_hash: 'mock_hash_password123', created_at: new Date() },
      { id: 5, name: 'Gurpreet Singh', phone: '9876543214', role: 'FARMER', password_hash: 'mock_hash_password123', created_at: new Date() },
      { id: 6, name: 'Mohan Lal', phone: '9876543215', role: 'FARMER', password_hash: 'mock_hash_password123', created_at: new Date() },
    ];
  }

  initDefaultSlotsAndBookings() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dates = Array.from(new Set(['2026-09-10', '2026-09-11', todayStr, '2026-09-12', '2026-09-13', '2026-09-14']));
    const timeSlots = [
      { start: '09:00:00', end: '11:00:00', capacity: 50 },
      { start: '11:00:00', end: '13:00:00', capacity: 50 },
      { start: '14:00:00', end: '16:00:00', capacity: 50 },
      { start: '16:00:00', end: '18:00:00', capacity: 50 },
    ];

    this.slots = [];
    let slotId = 1;
    for (const d of dates) {
      for (const t of timeSlots) {
        this.slots.push({
          id: slotId++,
          centre_id: 1,
          slot_date: d,
          start_time: t.start,
          end_time: t.end,
          capacity: t.capacity,
          booked_count: 0,
        });
      }
    }
    for (const d of dates) {
      for (const t of timeSlots) {
        this.slots.push({
          id: slotId++,
          centre_id: 2,
          slot_date: d,
          start_time: t.start,
          end_time: t.end,
          capacity: t.capacity,
          booked_count: 0,
        });
      }
    }

    // Default active demo bookings across slots
    const todaySlot1 = this.slots.find(s => s.centre_id === 1 && s.slot_date === todayStr && s.start_time.startsWith('09')) || this.slots[0];
    const todaySlot2 = this.slots.find(s => s.centre_id === 1 && s.slot_date === todayStr && s.start_time.startsWith('11')) || this.slots[2];
    const todaySlot3 = this.slots.find(s => s.centre_id === 1 && s.slot_date === todayStr && s.start_time.startsWith('14')) || this.slots[4];

    this.bookings = [
      {
        id: 101,
        user_id: 1,
        centre_id: 1,
        slot_id: todaySlot1.id,
        booking_date: todaySlot1.slot_date,
        token_number: 'BDW-001',
        qr_code: 'QR_BDW-001_101',
        crop: 'Wheat',
        quantity_kg: 2000,
        status: 'IN_QUEUE',
        created_at: new Date().toISOString(),
      },
      {
        id: 102,
        user_id: 4,
        centre_id: 1,
        slot_id: todaySlot1.id,
        booking_date: todaySlot1.slot_date,
        token_number: 'BDW-002',
        qr_code: 'QR_BDW-002_102',
        crop: 'Mustard',
        quantity_kg: 1500,
        status: 'ARRIVED',
        created_at: new Date().toISOString(),
      },
      {
        id: 103,
        user_id: 5,
        centre_id: 1,
        slot_id: todaySlot2.id,
        booking_date: todaySlot2.slot_date,
        token_number: 'BDW-003',
        crop: 'Paddy',
        quantity_kg: 3200,
        qr_code: 'QR_BDW-003_103',
        status: 'IN_QUEUE',
        created_at: new Date().toISOString(),
      },
      {
        id: 104,
        user_id: 6,
        centre_id: 1,
        slot_id: todaySlot3.id,
        booking_date: todaySlot3.slot_date,
        token_number: 'BDW-004',
        crop: 'Gram',
        quantity_kg: 1800,
        qr_code: 'QR_BDW-004_104',
        status: 'BOOKED',
        created_at: new Date().toISOString(),
      },
    ];

    todaySlot1.booked_count = 2;
    todaySlot2.booked_count = 1;
    todaySlot3.booked_count = 1;

    this.nextUserId = 7;
    this.nextBookingId = 105;
  }

  reset() {
    this.initDefaultUsers();
    this.initDefaultSlotsAndBookings();
  }
}

const memoryDb = new MemoryDb();

function createMockClient(pool) {
  const client = new EventEmitter();
  client.query = (text, params, cb) => {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    const promise = pool.query(text, params);
    if (typeof cb === 'function') {
      promise
        .then((res) => cb(null, res))
        .catch((err) => cb(err));
      return;
    }
    return promise;
  };
  client.release = () => {};
  return client;
}

function setupDbFallback(pool) {
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);

  pool.connect = (cb) => {
    if (pool._useRealPostgres === false || process.env.USE_MOCK_DB === 'true') {
      const mockClient = createMockClient(pool);
      if (typeof cb === 'function') {
        cb(null, mockClient, () => {});
        return;
      }
      return Promise.resolve(mockClient);
    }

    if (typeof cb === 'function') {
      originalConnect((err, client, release) => {
        if (err) {
          pool._useRealPostgres = false;
          if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED')) || process.env.USE_MOCK_DB === 'true') {
            const mockClient = createMockClient(pool);
            return cb(null, mockClient, () => {});
          }
          return cb(err);
        }
        pool._useRealPostgres = true;
        seedDefaultUsers(client).finally(() => cb(null, client, release));
      });
      return;
    }

    return new Promise((resolve, reject) => {
      originalConnect((err, client, release) => {
        if (err) {
          pool._useRealPostgres = false;
          if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED')) || process.env.USE_MOCK_DB === 'true') {
            const mockClient = createMockClient(pool);
            return resolve(mockClient);
          }
          return reject(err);
        }
        pool._useRealPostgres = true;
        seedDefaultUsers(client).finally(() => resolve(client));
      });
    });
  };

  async function seedDefaultUsers(client) {
    if (pool._hasSeeded) return;
    pool._hasSeeded = true;
    try {
      const existing = await client.query('SELECT id FROM users WHERE phone IN ($1, $2, $3)', ['9876543210', '9876543211', '9876543212']);
      if (existing.rows.length < 3) {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('password123', 10);
        const defaultUsers = [
          ['Ramesh Kumar', '9876543210', 'FARMER', hash],
          ['Suresh Sharma', '9876543211', 'OFFICER', hash],
          ['Anita Roy', '9876543212', 'ADMIN', hash],
        ];
        for (const [name, phone, role, password_hash] of defaultUsers) {
          await client.query(
            `INSERT INTO users (name, phone, role, password_hash)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash`,
            [name, phone, role, password_hash]
          );
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }

  pool.query = (text, params, cb) => {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }

    if (process.env.USE_MOCK_DB !== 'true' && pool._useRealPostgres !== false) {
      try {
        const p = originalQuery(text, params, cb);
        if (!cb && p && typeof p.catch === 'function') {
          return p.catch((err) => {
            if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
              pool._useRealPostgres = false;
              return pool.query(text, params);
            }
            throw err;
          });
        }
        return p;
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
          pool._useRealPostgres = false;
        } else {
          throw err;
        }
      }
    }

    const runQuery = new Promise((resolve, reject) => {
      try {
        const queryStr = typeof text === 'string' ? text : (text && text.text ? text.text : '');

        if (queryStr.includes('SELECT id FROM users WHERE phone = $1')) {
          const phone = params[0];
          const existing = memoryDb.users.filter(u => u.phone === phone);
          return resolve({ rows: existing });
        }

        if (queryStr.includes('SELECT id, name, phone, role, password_hash FROM users WHERE phone = $1')) {
          const phone = params[0];
          const existing = memoryDb.users.filter(u => u.phone === phone);
          return resolve({ rows: existing });
        }

        if (queryStr.includes('INSERT INTO users')) {
          const [name, phone, role, passwordHash] = params;
          const user = {
            id: memoryDb.nextUserId++,
            name,
            phone,
            role,
            password_hash: passwordHash,
            created_at: new Date(),
          };
          memoryDb.users.push(user);
          return resolve({ rows: [user] });
        }

        if (queryStr.includes('FROM centres') && queryStr.includes('SELECT id, name')) {
          return resolve({ rows: memoryDb.centres });
        }

        if (queryStr.includes('WHERE centre_id = $1 AND slot_date = $2')) {
          const centreId = params[0];
          const date = params[1] ? String(params[1]).split('T')[0] : new Date().toISOString().split('T')[0];
          
          let filtered = memoryDb.slots.filter(
            s => String(s.centre_id) === String(centreId) && String(s.slot_date).split('T')[0] === date
          );

          if (filtered.length === 0) {
            // Auto-generate 4 standard slots for any date requested
            const defaultTimes = [
              ['09:00:00', '11:00:00'],
              ['11:00:00', '13:00:00'],
              ['14:00:00', '16:00:00'],
              ['16:00:00', '18:00:00'],
            ];
            filtered = defaultTimes.map(([st, et]) => {
              const newSlot = {
                id: memoryDb.slots.length + 1,
                centre_id: Number(centreId),
                slot_date: date,
                start_time: st,
                end_time: et,
                capacity: 50,
                booked_count: 0,
              };
              memoryDb.slots.push(newSlot);
              return newSlot;
            });
          }

          const rows = filtered.map(s => ({
            ...s,
            slot_date: String(s.slot_date).split('T')[0],
            available_count: s.capacity - s.booked_count,
          }));
          return resolve({ rows });
        }

        if (queryStr.includes('INSERT INTO slots')) {
          const centreId = params[0];
          const date = params[1] ? String(params[1]).split('T')[0] : new Date().toISOString().split('T')[0];
          const defaultTimes = [
            ['09:00:00', '11:00:00'],
            ['11:00:00', '13:00:00'],
            ['14:00:00', '16:00:00'],
            ['16:00:00', '18:00:00'],
          ];
          const inserted = defaultTimes.map(([st, et]) => {
            const newSlot = {
              id: memoryDb.slots.length + 1,
              centre_id: Number(centreId),
              slot_date: date,
              start_time: st,
              end_time: et,
              capacity: 50,
              booked_count: 0,
            };
            memoryDb.slots.push(newSlot);
            return newSlot;
          });
          return resolve({ rows: inserted });
        }

        if (queryStr.includes('FROM slots') && queryStr.includes('WHERE id = $1')) {
          const [slotId] = params;
          const slot = memoryDb.slots.find(s => String(s.id) === String(slotId));
          if (slot && slot.booked_count >= slot.capacity) {
            return resolve({ rows: [{ ...slot, booked_count: slot.capacity }] });
          }
          return resolve({ rows: slot ? [slot] : [] });
        }

        if (queryStr.includes('SELECT id FROM bookings') && queryStr.includes('WHERE user_id = $1 AND slot_id = $2')) {
          const [userId, slotId] = params;
          const active = memoryDb.bookings.filter(b => String(b.user_id) === String(userId) && String(b.slot_id) === String(slotId) && ['BOOKED','ARRIVED','IN_QUEUE','PROCESSING'].includes(b.status));
          return resolve({ rows: active });
        }

        if (queryStr.includes('SELECT code FROM centres WHERE id = $1')) {
          const [centreId] = params;
          const centre = memoryDb.centres.find(c => String(c.id) === String(centreId));
          return resolve({ rows: centre ? [{ code: centre.code }] : [] });
        }

        if (queryStr.includes('SELECT token_number') && queryStr.includes('FROM bookings') && queryStr.includes('WHERE centre_id = $1')) {
          const [centreId] = params;
          const centreBookings = memoryDb.bookings.filter(b => String(b.centre_id) === String(centreId));
          const last = centreBookings[centreBookings.length - 1];
          return resolve({ rows: last ? [{ token_number: last.token_number }] : [] });
        }

        if (queryStr.includes('COUNT(*)') && queryStr.includes('FROM bookings') && queryStr.includes('WHERE centre_id = $1') && !queryStr.includes('booking_date = $2')) {
          const [centreId] = params;
          const total = memoryDb.bookings.filter(b => String(b.centre_id) === String(centreId)).length;
          return resolve({ rows: [{ total }] });
        }

        if (queryStr.includes('COUNT(*)') && queryStr.includes('FROM bookings') && queryStr.includes('WHERE centre_id = $1 AND booking_date = $2')) {
          const [centreId, date] = params;
          const total = memoryDb.bookings.filter(b => String(b.centre_id) === String(centreId) && String(b.booking_date) === String(date)).length;
          return resolve({ rows: [{ total }] });
        }

        if (queryStr.includes('INSERT INTO bookings')) {
          const [userId, centre_id, slot_id, bookingDate, tokenNumber, qrString, crop, quantity_kg] = params;
          const booking = {
            id: memoryDb.nextBookingId++,
            user_id: userId,
            centre_id,
            slot_id,
            booking_date: bookingDate,
            token_number: tokenNumber,
            qr_code: qrString,
            crop,
            quantity_kg,
            status: 'BOOKED',
            created_at: new Date().toISOString(),
          };
          memoryDb.bookings.push(booking);
          return resolve({ rows: [booking] });
        }

        if (queryStr.includes('UPDATE slots SET booked_count = booked_count + 1')) {
          const [slotId] = params;
          const slot = memoryDb.slots.find(s => String(s.id) === String(slotId));
          if (slot) slot.booked_count += 1;
          return resolve({ rows: [] });
        }

        if (queryStr.includes('FROM bookings b') && queryStr.includes('JOIN users') && queryStr.includes('WHERE b.id = $1')) {
          const [bookingId] = params;
          const booking = memoryDb.bookings.find(b => String(b.id) === String(bookingId));
          if (!booking) return resolve({ rows: [] });
          const farmer = memoryDb.users.find(u => String(u.id) === String(booking.user_id)) || {};
          const centre = memoryDb.centres.find(c => String(c.id) === String(booking.centre_id)) || {};
          const slot = memoryDb.slots.find(s => String(s.id) === String(booking.slot_id)) || {};
          return resolve({
            rows: [{
              ...booking,
              farmer_name: farmer.name || 'Ramesh Kumar',
              farmer_phone: farmer.phone || '9876543210',
              centre_name: centre.name,
              district: centre.district,
              state: centre.state,
              start_time: slot.start_time,
              end_time: slot.end_time,
            }],
          });
        }

        if (queryStr.includes('FROM bookings b') && queryStr.includes('JOIN users u') && queryStr.includes('JOIN slots s')) {
          const centreParam = params[0];
          const dateParam = params[1] && String(params[1]) !== 'null' && String(params[1]) !== 'ALL' && String(params[1]).trim() !== ''
            ? String(params[1]).split('T')[0]
            : null;
          const slotParam = params[2] && String(params[2]) !== 'null' && String(params[2]) !== 'ALL' && String(params[2]).trim() !== ''
            ? String(params[2])
            : null;

          const allowsBooked = queryStr.includes("'BOOKED'");
          const onlyBooked = queryStr.includes("b.status = 'BOOKED'");
          const eligibleStatuses = onlyBooked
            ? ['BOOKED']
            : allowsBooked
            ? ['BOOKED', 'ARRIVED', 'IN_QUEUE', 'PROCESSING']
            : ['ARRIVED', 'IN_QUEUE', 'PROCESSING'];

          const active = memoryDb.bookings
            .filter(b => {
              const matchesCentre = !centreParam || String(b.centre_id) === String(centreParam);
              const matchesDate = !dateParam || String(b.booking_date).split('T')[0] === dateParam;
              const matchesSlot = !slotParam || String(b.slot_id) === String(slotParam);
              const isStatusActive = eligibleStatuses.includes(b.status) && b.status !== 'COMPLETED';
              return matchesCentre && matchesDate && matchesSlot && isStatusActive;
            })
            .map(b => {
              const farmer = memoryDb.users.find(u => String(u.id) === String(b.user_id)) || {};
              const centre = memoryDb.centres.find(c => String(c.id) === String(b.centre_id)) || {};
              const slot = memoryDb.slots.find(s => String(s.id) === String(b.slot_id)) || {};
              const startTime = slot.start_time || '09:00:00';
              const endTime = slot.end_time || '11:00:00';
              const slotTimeFormatted = `${String(startTime).substring(0, 5)} - ${String(endTime).substring(0, 5)}`;

              return {
                id: b.id,
                user_id: b.user_id,
                centre_id: b.centre_id,
                slot_id: b.slot_id,
                booking_date: b.booking_date,
                token_number: b.token_number,
                qr_code: b.qr_code,
                crop: b.crop,
                quantity_kg: b.quantity_kg,
                status: b.status,
                created_at: b.created_at,
                farmer_name: farmer.name || 'Ramesh Kumar',
                farmer_phone: farmer.phone || '9876543210',
                centre_name: centre.name || 'Burdwan Central Procurement Centre',
                centre_code: centre.code || 'BDW-01',
                start_time: startTime,
                end_time: endTime,
                slot_time: slotTimeFormatted,
              };
            })
            .sort((a, b) => {
              const statusRank = (s) => {
                if (s === 'PROCESSING') return 0;
                if (s === 'IN_QUEUE') return 1;
                if (s === 'ARRIVED') return 2;
                return 3;
              };
              if (statusRank(a.status) !== statusRank(b.status)) {
                return statusRank(a.status) - statusRank(b.status);
              }
              if (a.start_time !== b.start_time) {
                return String(a.start_time).localeCompare(String(b.start_time));
              }
              return a.id - b.id;
            });

          return resolve({ rows: active });
        }

        if (queryStr.includes('FROM bookings b') && queryStr.includes('WHERE b.user_id = $1')) {
          const [userId] = params;
          const userBookings = memoryDb.bookings
            .filter(b => String(b.user_id) === String(userId))
            .map(b => {
              const centre = memoryDb.centres.find(c => String(c.id) === String(b.centre_id)) || {};
              const slot = memoryDb.slots.find(s => String(s.id) === String(b.slot_id)) || {};
              return {
                ...b,
                centre_name: centre.name,
                start_time: slot.start_time,
                end_time: slot.end_time,
              };
            });
          return resolve({ rows: userBookings });
        }

        if (queryStr.includes('FROM bookings b') && queryStr.includes('WHERE b.qr_code = $1 OR b.token_number = $1 OR u.phone = $1')) {
          const [criteria] = params;
          const booking = memoryDb.bookings.find(b => b.qr_code === criteria || b.token_number === criteria);
          if (!booking) return resolve({ rows: [] });
          const farmer = memoryDb.users.find(u => u.id === booking.user_id) || {};
          const centre = memoryDb.centres.find(c => c.id === booking.centre_id) || {};
          const slot = memoryDb.slots.find(s => s.id === booking.slot_id) || {};
          return resolve({
            rows: [{
              booking_id: booking.id,
              token_number: booking.token_number,
              qr_code: booking.qr_code,
              crop: booking.crop,
              booked_quantity: booking.quantity_kg,
              booking_status: booking.status,
              created_at: booking.created_at,
              farmer_name: farmer.name || 'Ramesh Kumar',
              farmer_phone: farmer.phone || '9876543210',
              centre_id: centre.id,
              centre_name: centre.name,
              centre_code: centre.code,
              slot_id: slot.id,
              slot_date: slot.slot_date,
              start_time: slot.start_time,
              end_time: slot.end_time,
            }],
          });
        }

        if (queryStr.includes('SELECT id, token_number FROM bookings') && queryStr.includes("status = 'PROCESSING'")) {
          const [centreId, bookingDate] = params;
          const activeProcessing = memoryDb.bookings.filter(b => String(b.centre_id) === String(centreId) && String(b.booking_date) === String(bookingDate) && b.status === 'PROCESSING');
          return resolve({ rows: activeProcessing });
        }

        if (queryStr.includes('FROM bookings') && !queryStr.includes('JOIN') && (queryStr.includes('WHERE b.id = $1') || queryStr.includes('WHERE id = $1'))) {
          const [bookingId] = params;
          const booking = memoryDb.bookings.find(b => String(b.id) === String(bookingId));
          return resolve({ rows: booking ? [booking] : [] });
        }

        if (queryStr.includes('SELECT id FROM procurements WHERE booking_id = $1')) {
          const [bookingId] = params;
          if (!memoryDb.procurements) memoryDb.procurements = [];
          const existing = memoryDb.procurements.filter(p => String(p.booking_id) === String(bookingId));
          return resolve({ rows: existing });
        }

        if (queryStr.includes('INSERT INTO procurements')) {
          const [booking_id, officerId, weight_kg, grade, totalAmount] = params;
          if (!memoryDb.procurements) memoryDb.procurements = [];
          const procurement = {
            id: (memoryDb.procurements.length + 1) * 10,
            booking_id,
            officer_id: officerId,
            weight_kg,
            grade,
            total_amount: totalAmount,
            status: 'COMPLETED',
            created_at: new Date().toISOString(),
          };
          memoryDb.procurements.push(procurement);
          return resolve({ rows: [procurement] });
        }

        if (queryStr.includes('INSERT INTO payments')) {
          const [procurement_id, booking_id, farmer_id, amount, referenceNumber] = params;
          if (!memoryDb.payments) memoryDb.payments = [];
          const payment = {
            id: (memoryDb.payments.length + 1) * 100,
            procurement_id,
            booking_id,
            farmer_id,
            amount,
            status: 'RECORDED',
            reference_number: referenceNumber,
            updated_at: new Date().toISOString(),
          };
          memoryDb.payments.push(payment);
          return resolve({ rows: [payment] });
        }

        if (queryStr.includes("UPDATE bookings SET status = 'COMPLETED' WHERE id = $1")) {
          const [bookingId] = params;
          const booking = memoryDb.bookings.find(b => String(b.id) === String(bookingId));
          if (booking) booking.status = 'COMPLETED';
          return resolve({ rows: [] });
        }

        if (queryStr.includes("UPDATE bookings SET status = 'IN_QUEUE' WHERE id = $1")) {
          const [bookingId] = params;
          const booking = memoryDb.bookings.find(b => String(b.id) === String(bookingId));
          if (booking) booking.status = 'IN_QUEUE';
          return resolve({ rows: [] });
        }

        if (queryStr.includes("UPDATE bookings SET status = 'PROCESSING' WHERE id = $1")) {
          const [bookingId] = params;
          const booking = memoryDb.bookings.find(b => String(b.id) === String(bookingId));
          if (booking) booking.status = 'PROCESSING';
          return resolve({ rows: [] });
        }

        if (queryStr.includes('FROM payments') && (queryStr.includes('WHERE id = $1') || queryStr.includes('booking_id = $1') || queryStr.includes('WHERE pm.id = $1'))) {
          const [id] = params;
          if (!memoryDb.payments) memoryDb.payments = [];
          const payment = memoryDb.payments.find(p => String(p.booking_id) === String(id) || String(p.id) === String(id));
          return resolve({ rows: payment ? [{ ...payment, payment_id: payment.id }] : [] });
        }

        if (queryStr.includes('UPDATE payments') && queryStr.includes('SET status = $1')) {
          const [nextStatus, paymentId] = params;
          if (!memoryDb.payments) memoryDb.payments = [];
          const payment = memoryDb.payments.find(p => String(p.id) === String(paymentId));
          if (payment) {
            payment.status = nextStatus;
            payment.updated_at = new Date().toISOString();
          }
          return resolve({ rows: payment ? [{ ...payment, payment_id: payment.id }] : [] });
        }

        if (queryStr.includes('INSERT INTO sms_verifications')) {
          let procurementId, phone, message;
          if (params.length >= 5) {
            procurementId = params[0];
            phone = params[3];
            message = params[4];
          } else {
            [procurementId, phone, message] = params;
          }
          if (!memoryDb.smsVerifications) memoryDb.smsVerifications = [];
          const sms = {
            id: memoryDb.smsVerifications.length + 1,
            procurement_id: procurementId,
            farmer_phone: phone,
            message,
            direction: 'OUTBOUND',
            response: null,
            status: 'SENT',
            created_at: new Date().toISOString(),
          };
          memoryDb.smsVerifications.push(sms);
          return resolve({ rows: [sms] });
        }

        if (queryStr.includes('SELECT procurement_id') && queryStr.includes('FROM sms_verifications')) {
          const [phone] = params;
          if (!memoryDb.smsVerifications) memoryDb.smsVerifications = [];
          const match = memoryDb.smsVerifications
            .slice()
            .reverse()
            .find(s => s.farmer_phone === phone && s.direction === 'OUTBOUND' && (s.status === 'SENT' || s.status === 'DELIVERED') && s.procurement_id != null);
          return resolve({ rows: match ? [{ procurement_id: match.procurement_id }] : [] });
        }

        if (queryStr.includes('FROM procurements WHERE id = $1')) {
          const [procId] = params;
          if (!memoryDb.procurements) memoryDb.procurements = [];
          const proc = memoryDb.procurements.find(p => String(p.id) === String(procId));
          return resolve({ rows: proc ? [proc] : [] });
        }

        if (queryStr.includes('UPDATE procurements') && queryStr.includes("SET status = 'DISPUTED'")) {
          const [procId] = params;
          if (!memoryDb.procurements) memoryDb.procurements = [];
          const proc = memoryDb.procurements.find(p => String(p.id) === String(procId));
          if (proc) proc.status = 'DISPUTED';
          return resolve({ rows: proc ? [proc] : [] });
        }

        if (queryStr.includes('UPDATE procurements') && queryStr.includes("SET status = 'COMPLETED'")) {
          const [procId] = params;
          if (!memoryDb.procurements) memoryDb.procurements = [];
          const proc = memoryDb.procurements.find(p => String(p.id) === String(procId));
          if (proc) proc.status = 'COMPLETED';
          return resolve({ rows: proc ? [proc] : [] });
        }

        if (queryStr.includes('FROM procurements p') && (queryStr.includes("p.status = 'DISPUTED'") || queryStr.includes("s.response = '2'"))) {
          if (!memoryDb.procurements) memoryDb.procurements = [];
          if (!memoryDb.smsVerifications) memoryDb.smsVerifications = [];

          const rows = [];
          for (const p of memoryDb.procurements) {
            if (p.status === 'DISPUTED') {
              const booking = (memoryDb.bookings || []).find(b => String(b.id) === String(p.booking_id)) || {};
              const farmer = (memoryDb.users || []).find(u => String(u.id) === String(booking.user_id)) || {};
              const centre = (memoryDb.centres || []).find(c => String(c.id) === String(booking.centre_id)) || {};
              const sms = memoryDb.smsVerifications.find(s => String(s.procurement_id) === String(p.id));

              rows.push({
                id: p.id,
                weight_kg: p.weight_kg,
                procurement_status: p.status,
                crop: booking.crop || 'Wheat',
                farmer_name: farmer.name || 'Ramesh Kumar',
                farmer_phone: farmer.phone || (sms ? sms.farmer_phone : '9876543210'),
                centre_name: centre.name || 'Burdwan Central Procurement Centre',
                created_at: p.created_at || (sms ? sms.created_at : new Date().toISOString()),
              });
            }
          }
          return resolve({ rows });
        }

        if (
          queryStr.includes('SELECT id, status, response FROM sms_verifications') ||
          queryStr.includes('SELECT id, status, response, farmer_phone FROM sms_verifications') ||
          (queryStr.includes('FROM sms_verifications') && queryStr.includes('WHERE procurement_id = $1'))
        ) {
          const [procId] = params;
          if (!memoryDb.smsVerifications) memoryDb.smsVerifications = [];
          const match = memoryDb.smsVerifications
            .slice()
            .reverse()
            .find(s => String(s.procurement_id) === String(procId) && s.direction === 'OUTBOUND');
          if (!match) return resolve({ rows: [] });

          return resolve({ rows: [{ ...match }] });
        }

        if (queryStr.includes('UPDATE sms_verifications') && queryStr.includes('procurement_id = $1')) {
          const [procId] = params;
          if (!memoryDb.smsVerifications) memoryDb.smsVerifications = [];
          const matched = memoryDb.smsVerifications.filter(s => String(s.procurement_id) === String(procId) && s.status === 'DISPUTED');
          matched.forEach(s => {
            s.status = 'CONFIRMED';
          });
          return resolve({ rows: matched });
        }

        if (queryStr.includes('UPDATE sms_verifications')) {
          const [nextStatus, responseCode, id] = params;
          if (!memoryDb.smsVerifications) memoryDb.smsVerifications = [];
          const sms = memoryDb.smsVerifications.find(s => String(s.id) === String(id));
          if (sms) {
            sms.status = nextStatus;
            sms.response = responseCode;
          }
          return resolve({ rows: sms ? [sms] : [] });
        }

        if (queryStr.includes("SELECT COUNT(*) AS total FROM users WHERE role = 'FARMER'")) {
          const total = memoryDb.users.filter(u => u.role === 'FARMER').length;
          return resolve({ rows: [{ total }] });
        }

        if (queryStr.includes('SELECT status, COUNT(*) AS count') && queryStr.includes('FROM bookings')) {
          const [date] = params;
          const statusCounts = {};
          memoryDb.bookings
            .filter(b => String(b.booking_date) === String(date))
            .forEach(b => {
              statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
            });
          const rows = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
          return resolve({ rows });
        }

        if (queryStr.includes('SELECT COUNT(p.id) AS completed_count') && queryStr.includes('FROM procurements p')) {
          const [date] = params;
          const procs = (memoryDb.procurements || []).filter(p => {
            const booking = memoryDb.bookings.find(b => String(b.id) === String(p.booking_id));
            return booking && String(booking.booking_date) === String(date) && p.status === 'COMPLETED';
          });
          const completed_count = procs.length;
          const total_weight_kg = procs.reduce((sum, p) => sum + (parseFloat(p.weight_kg) || 0), 0);
          const total_amount = procs.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
          return resolve({ rows: [{ completed_count, total_weight_kg, total_amount }] });
        }

        if (queryStr.includes('SELECT pm.status, COUNT(*) AS count') && queryStr.includes('FROM payments pm')) {
          const [date] = params;
          const statusCounts = {};
          (memoryDb.payments || []).forEach(pm => {
            const booking = memoryDb.bookings.find(b => String(b.id) === String(pm.booking_id));
            if (booking && String(booking.booking_date) === String(date)) {
              statusCounts[pm.status] = (statusCounts[pm.status] || 0) + 1;
            }
          });
          const rows = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
          return resolve({ rows });
        }

        if (queryStr.includes('FROM centres WHERE is_active = true')) {
          return resolve({ rows: memoryDb.centres });
        }

        return resolve({ rows: [] });
      } catch (e) {
        reject(e);
      }
    });

    if (typeof cb === 'function') {
      runQuery.then((res) => cb(null, res)).catch((err) => cb(err));
      return;
    }
    return runQuery;
  };
}

module.exports = setupDbFallback;
module.exports.memoryDb = memoryDb;
