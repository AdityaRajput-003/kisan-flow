const pool = require('../config/db');
const redisClient = require('../config/redis');

class AdminService {
  /**
   * Get real-time operational overview summary for Admin dashboard
   * @param {string} [targetDate] - Optional date parameter (YYYY-MM-DD), defaults to today
   */
  async getOverview(targetDate) {
    // Default date to today's server date if not provided or invalid
    let dateStr = targetDate;
    if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateStr = new Date().toISOString().split('T')[0];
    }

    // 1. PostgreSQL: Count registered farmers
    const farmersRes = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'FARMER'`
    );
    const totalFarmers = parseInt(farmersRes.rows[0]?.total || 0, 10);

    // 2. PostgreSQL: Count bookings by status for the target operational date
    const bookingsRes = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM bookings
       WHERE booking_date = $1
       GROUP BY status`,
      [dateStr]
    );

    const bookingStatusCounts = {
      total: 0,
      booked: 0,
      arrived: 0,
      in_queue: 0,
      processing: 0,
      completed: 0,
    };

    bookingsRes.rows.forEach(row => {
      const cnt = parseInt(row.count, 10);
      bookingStatusCounts.total += cnt;
      const key = row.status ? row.status.toLowerCase() : '';
      if (key in bookingStatusCounts) {
        bookingStatusCounts[key] = cnt;
      }
    });

    // 3. PostgreSQL: Summary of completed procurements for the operational date
    const procurementsRes = await pool.query(
      `SELECT COUNT(p.id) AS completed_count,
              COALESCE(SUM(p.weight_kg), 0) AS total_weight_kg,
              COALESCE(SUM(p.total_amount), 0) AS total_amount
       FROM procurements p
       JOIN bookings b ON p.booking_id = b.id
       WHERE b.booking_date = $1 AND p.status = 'COMPLETED'`,
      [dateStr]
    );

    const procRow = procurementsRes.rows[0] || {};
    const procurementSummary = {
      completed_count: parseInt(procRow.completed_count || 0, 10),
      total_weight_kg: parseFloat(procRow.total_weight_kg || 0),
      total_amount: parseFloat(procRow.total_amount || 0),
    };

    // 4. PostgreSQL: Summary of payments by current status for the operational date
    const paymentsRes = await pool.query(
      `SELECT pm.status, COUNT(*) AS count
       FROM payments pm
       JOIN bookings b ON pm.booking_id = b.id
       WHERE b.booking_date = $1
       GROUP BY pm.status`,
      [dateStr]
    );

    const paymentStatusCounts = {
      recorded: 0,
      initiated: 0,
      processing: 0,
      credited: 0,
    };

    paymentsRes.rows.forEach(row => {
      const cnt = parseInt(row.count, 10);
      const key = row.status ? row.status.toLowerCase() : '';
      if (key in paymentStatusCounts) {
        paymentStatusCounts[key] = cnt;
      }
    });

    // 5. PostgreSQL + Redis: Active Procurement Centres summary with live queue length and serving token
    const centresRes = await pool.query(
      `SELECT id, name, code, district, state
       FROM centres
       WHERE is_active = true
       ORDER BY name ASC`
    );

    let redisHealthy = true;
    const centresSummary = await Promise.all(
      centresRes.rows.map(async (c) => {
        const queueKey = `queue:${c.id}:${dateStr}`;
        const processingKey = `processing:${c.id}:${dateStr}`;

        let queueLength = null;
        let currentlyProcessing = null;

        if (redisHealthy) {
          try {
            const list = await redisClient.lrange(queueKey, 0, -1);
            queueLength = Array.isArray(list) ? list.length : 0;

            const servingToken = await redisClient.get(processingKey);
            currentlyProcessing = servingToken || null;
          } catch (rErr) {
            redisHealthy = false;
            console.error(`[Admin Overview - Redis Error for Centre #${c.id}]`, rErr.message);
            queueLength = null;
            currentlyProcessing = null;
          }
        }

        return {
          centre_id: c.id,
          centre_name: c.name,
          centre_code: c.code,
          queue_length: queueLength,
          currently_processing: currentlyProcessing,
        };
      })
    );

    return {
      date: dateStr,
      queue_available: redisHealthy,
      farmers: {
        total: totalFarmers,
      },
      bookings: bookingStatusCounts,
      procurement: procurementSummary,
      payments: paymentStatusCounts,
      centres: centresSummary,
    };
  }

  /**
   * Get list of procurement disputes for Admin inspection
   */
  async getDisputes() {
    const disputesRes = await pool.query(
      `SELECT DISTINCT
         p.id,
         p.weight_kg,
         p.status AS procurement_status,
         b.crop,
         u.name AS farmer_name,
         COALESCE(u.phone, s.farmer_phone) AS farmer_phone,
         c.name AS centre_name,
         COALESCE(s.created_at, p.created_at) AS created_at
       FROM procurements p
       JOIN bookings b ON p.booking_id = b.id
       JOIN users u ON b.user_id = u.id
       JOIN centres c ON b.centre_id = c.id
       LEFT JOIN sms_verifications s ON s.procurement_id = p.id
       WHERE p.status = 'DISPUTED'
       ORDER BY p.id DESC`
    );

    return disputesRes.rows.map(row => {
      const isDisputed = row.procurement_status === 'DISPUTED';
      let formattedTimestamp = String(row.created_at || '');
      const dateObj = row.created_at ? new Date(row.created_at) : new Date();
      if (!isNaN(dateObj.getTime())) {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(dateObj);
        const m = {};
        for (const p of parts) {
          m[p.type] = p.value;
        }
        const hour = m.hour === '24' ? '00' : m.hour;
        formattedTimestamp = `${m.year}-${m.month}-${m.day} ${hour}:${m.minute} IST`;
      }

      return {
        id: row.id,
        procurement_id: row.id,
        farmer_name: row.farmer_name || 'Farmer',
        farmer_phone: row.farmer_phone || '',
        centre_name: row.centre_name || '',
        crop: row.crop || 'Crop',
        weight_kg: parseFloat(row.weight_kg) || 0,
        issue: 'Farmer replied 2 (DISPUTE) to post-procurement verification SMS',
        status: isDisputed ? 'DISPUTED' : 'RESOLVED',
        timestamp: formattedTimestamp,
      };
    });
  }

  /**
   * Resolve an existing procurement dispute
   * @param {number|string} procurementId
   */
  async resolveDispute(procurementId) {
    const numId = Number(procurementId);
    if (!procurementId || isNaN(numId) || !Number.isInteger(numId) || numId <= 0 || !/^\d+$/.test(String(procurementId).trim())) {
      const err = new Error(`Invalid procurement ID: ${procurementId}`);
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const procCheck = await client.query(
        'SELECT id, status FROM procurements WHERE id = $1 FOR UPDATE',
        [numId]
      );

      if (procCheck.rows.length === 0) {
        const err = new Error(`Procurement record not found for ID: ${numId}`);
        err.statusCode = 404;
        throw err;
      }

      const procurement = procCheck.rows[0];
      if (procurement.status !== 'DISPUTED') {
        const err = new Error(
          `Procurement #${numId} is not in DISPUTED state (current status: '${procurement.status}')`
        );
        err.statusCode = 409;
        throw err;
      }

      await client.query(
        `UPDATE procurements
         SET status = 'COMPLETED'
         WHERE id = $1`,
        [numId]
      );

      await client.query(
        `UPDATE sms_verifications
         SET status = 'CONFIRMED'
         WHERE procurement_id = $1 AND status = 'DISPUTED'`,
        [numId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        procurement_id: numId,
        status: 'RESOLVED',
      };
    } catch (err) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('[Admin Service Rollback Error]', rollbackErr.message);
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new AdminService();
