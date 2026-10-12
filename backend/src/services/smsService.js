const pool = require('../config/db');
const config = require('../config/env');

let twilioClient = null;
if (config.twilio && config.twilio.accountSid && config.twilio.authToken) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  } catch (err) {
    console.error('[SMS Service Twilio Init Error]', err.message);
  }
}

class SmsService {
  /**
   * Helper to normalize Indian phone numbers (+91XXXXXXXXXX) for Twilio
   */
  normalizePhone(phone) {
    if (!phone) return '';
    const cleaned = String(phone).trim().replace(/[^\d+]/g, '');
    if (cleaned.length === 10 && !cleaned.startsWith('+')) {
      return `+91${cleaned}`;
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Helper to normalize inbound phone numbers to standard 10-digit format for database correlation
   */
  normalizeInboundPhone(phone) {
    if (!phone) return null;
    const trimmed = String(phone).trim();
    if (!trimmed) return null;

    const digitsOnly = trimmed.replace(/[^\d]/g, '');

    let candidate = null;
    // 10-digit Indian mobile number (e.g. 9876543210)
    if (digitsOnly.length === 10) {
      candidate = digitsOnly;
    // 12-digit number with 91 country code (e.g. 919876543210 or +919876543210)
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      candidate = digitsOnly.slice(2);
    // 11-digit number with leading 0 (e.g. 09876543210)
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      candidate = digitsOnly.slice(1);
    }

    // Validate Indian mobile number: 10 digits starting with 6, 7, 8, or 9
    if (candidate && /^[6-9]\d{9}$/.test(candidate)) {
      return candidate;
    }

    return null;
  }

  /**
   * Helper to check if a target recipient is on the verified trial allowlist
   */
  isRecipientVerified(phone) {
    const formattedTo = this.normalizePhone(phone);
    const rawConfig = config.twilio ? config.twilio.verifiedRecipients : null;
    if (!rawConfig) return true;

    const allowedList = String(rawConfig)
      .split(',')
      .map((num) => this.normalizePhone(num.trim()))
      .filter(Boolean);

    if (allowedList.length === 0) return true;

    return allowedList.includes(formattedTo);
  }

  /**
   * Central SMS dispatch function handling DB logging, Twilio integration, and idempotency
   */
  async sendSms({
    to,
    body,
    bookingId = null,
    farmerId = null,
    procurementId = null,
    messageType = 'NOTIFICATION',
    metadata = {}
  }) {
    if (!to || !body) {
      console.warn('[SMS Service] Missing target phone or message body.');
      return { success: false, error: 'Target phone and body required' };
    }

    // Idempotency check for booking + messageType
    if (bookingId && messageType) {
      try {
        const existing = await pool.query(
          `SELECT id, status, provider_message_id FROM sms_verifications
           WHERE booking_id = $1 AND message_type = $2 AND direction = 'OUTBOUND'
           ORDER BY id DESC LIMIT 1`,
          [bookingId, messageType]
        );
        if (existing.rows.length > 0) {
          console.log(`[SMS Service Idempotent Skip] Booking #${bookingId} already received notification type '${messageType}'.`);
          return {
            success: true,
            idempotentSkipped: true,
            messageId: existing.rows[0].id,
            status: existing.rows[0].status,
          };
        }
      } catch (checkErr) {
        console.error('[SMS Service Idempotency Check Error]', checkErr.message);
      }
    }

    const formattedTo = this.normalizePhone(to);
    const isTwilioEnabled = Boolean(config.twilio && config.twilio.enabled && twilioClient && config.twilio.fromNumber);

    let initialStatus = 'SENT';
    let provider = isTwilioEnabled ? 'TWILIO' : 'SIMULATED';
    let smsRecord = null;

    // 1. Log outbound SMS in database
    try {
      const res = await pool.query(
        `INSERT INTO sms_verifications 
           (procurement_id, booking_id, farmer_id, farmer_phone, message, direction, status, message_type, provider, sent_at)
         VALUES ($1, $2, $3, $4, $5, 'OUTBOUND', $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (booking_id, message_type) WHERE direction = 'OUTBOUND' AND booking_id IS NOT NULL AND message_type IS NOT NULL DO NOTHING
         RETURNING id, procurement_id, booking_id, farmer_id, farmer_phone, message, direction, status, message_type, provider, created_at`,
        [procurementId, bookingId, farmerId, to, body, initialStatus, messageType, provider]
      );
      if (res.rows && res.rows.length > 0) {
        smsRecord = res.rows[0];
      } else {
        console.log(`[SMS Service Idempotent Skip - DB Index] Booking #${bookingId} already has OUTBOUND '${messageType}'.`);
        return {
          success: true,
          idempotentSkipped: true,
          status: 'SKIPPED_DUPLICATE',
        };
      }
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        console.log(`[SMS Service Idempotent Skip - DB Catch] Booking #${bookingId} already has OUTBOUND '${messageType}'.`);
        return {
          success: true,
          idempotentSkipped: true,
          status: 'SKIPPED_DUPLICATE',
        };
      }
      console.error('[SMS Service DB Log Error]', dbErr.message);
    }

    // 2. Dispatch via Twilio if enabled
    if (isTwilioEnabled) {
      if (!this.isRecipientVerified(formattedTo)) {
        console.log(`[SMS Service] SMS skipped - recipient ${formattedTo} is not verified on the Twilio trial account.`);
        if (smsRecord && smsRecord.id) {
          try {
            await pool.query(
              `UPDATE sms_verifications
               SET provider_status = 'skipped', delivery_status = 'SKIPPED_UNVERIFIED'
               WHERE id = $1`,
              [smsRecord.id]
            );
            smsRecord.provider_status = 'skipped';
            smsRecord.delivery_status = 'SKIPPED_UNVERIFIED';
          } catch (uErr) {
            console.error('[SMS Service DB Error on Twilio Skip Update]', uErr.message);
          }
        }
        return {
          success: true,
          provider: 'TWILIO_TRIAL_SKIPPED',
          messageId: smsRecord ? smsRecord.id : `skipped_${Date.now()}`,
          status: 'SKIPPED_UNVERIFIED',
          smsRecord,
        };
      }

      try {
        console.log(`[SMS Service Outbound - TWILIO] To: ${formattedTo} (${messageType})\nBody:\n${body}`);
        
        const twilioPayload = {
          body,
          from: config.twilio.fromNumber,
          to: formattedTo,
        };
        if (config.twilio.statusCallbackUrl) {
          twilioPayload.statusCallback = config.twilio.statusCallbackUrl;
        }

        const twilioMsg = await twilioClient.messages.create(twilioPayload);

        const providerMsgId = twilioMsg.sid;
        const providerStatus = twilioMsg.status || 'queued';
        const deliveryStatus = (twilioMsg.status || 'queued').toUpperCase();

        if (smsRecord && smsRecord.id) {
          await pool.query(
            `UPDATE sms_verifications
             SET provider_message_id = $1, provider_status = $2, delivery_status = $3
             WHERE id = $4`,
            [providerMsgId, providerStatus, deliveryStatus, smsRecord.id]
          );
          smsRecord.provider_message_id = providerMsgId;
          smsRecord.provider_status = providerStatus;
          smsRecord.delivery_status = deliveryStatus;
        }

        return {
          success: true,
          provider: 'TWILIO',
          messageId: smsRecord ? smsRecord.id : providerMsgId,
          providerMessageId: providerMsgId,
          status: deliveryStatus,
          smsRecord,
        };
      } catch (twilioErr) {
        const isTrialUnverifiedRecipient =
          twilioErr.code === 21608 ||
          twilioErr.code === 21211 ||
          twilioErr.code === 21614 ||
          (twilioErr.message && (
            twilioErr.message.toLowerCase().includes('trial phone number is assigned for messaging') ||
            twilioErr.message.toLowerCase().includes('not currently authorized with your trial account') ||
            twilioErr.message.toLowerCase().includes('verified recipient') ||
            twilioErr.message.toLowerCase().includes('unverified')
          ));

        if (isTrialUnverifiedRecipient) {
          console.warn(`[SMS Service] SMS skipped - recipient ${formattedTo} is not verified on the Twilio trial account.`);
        } else {
          console.error(`[Twilio SMS Dispatch Error - Non-fatal] To: ${formattedTo}:`, twilioErr.message);
        }
        
        if (smsRecord && smsRecord.id) {
          try {
            await pool.query(
              `UPDATE sms_verifications
               SET status = 'FAILED', provider_status = 'failed', delivery_status = 'FAILED', error_code = $1, failed_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [twilioErr.code ? String(twilioErr.code) : twilioErr.message.substring(0, 100), smsRecord.id]
            );
            smsRecord.status = 'FAILED';
            smsRecord.delivery_status = 'FAILED';
          } catch (uErr) {
            console.error('[SMS Service DB Error on Twilio Failure Update]', uErr.message);
          }
        }

        return {
          success: false,
          provider: 'TWILIO',
          error: twilioErr.message,
          errorCode: twilioErr.code || 'TWILIO_ERROR',
          smsRecord,
        };
      }
    } else {
      console.log(`[SMS Service Outbound - SIMULATED (TWILIO_ENABLED=false)] To: ${to} (${messageType})\nBody:\n${body}`);
      return {
        success: true,
        provider: 'SIMULATED',
        messageId: smsRecord ? smsRecord.id : `msg_${Date.now()}`,
        status: 'SENT',
        smsRecord,
      };
    }
  }

  /**
   * Dispatches outbound procurement details SMS to farmer & logs to database
   */
  async sendProcurementConfirmation({ farmerName, phone, crop, weightKg, grade, centreName, procurementId, bookingId, farmerId }) {
    const message = `Your procurement details:\nFarmer: ${farmerName}\nCrop: ${crop}\nWeight: ${weightKg} kg\nGrade: ${grade}\nCentre: ${centreName}\n\nReply 1 to CONFIRM\nReply 2 to DISPUTE`;
    
    return this.sendSms({
      to: phone,
      body: message,
      procurementId,
      bookingId,
      farmerId,
      messageType: 'PROCUREMENT_CONFIRMATION',
    });
  }

  /**
   * Dispatches payment status notification SMS
   */
  async sendPaymentNotification({ bookingId, farmerPhone, amount, status, farmerId }) {
    const formattedAmount = parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    let body = '';
    const messageType = `PAYMENT_${status}`;

    switch (status) {
      case 'RECORDED':
        body = `KisanFlow: Your procurement payment of ₹${formattedAmount} has been recorded. Payment processing will begin shortly.`;
        break;
      case 'INITIATED':
        body = `KisanFlow: Your payment of ₹${formattedAmount} has been initiated.`;
        break;
      case 'PROCESSING':
        body = `KisanFlow: Your payment of ₹${formattedAmount} is currently being processed.`;
        break;
      case 'CREDITED':
        body = `KisanFlow: ₹${formattedAmount} has been credited successfully for your procurement.`;
        break;
      default:
        body = `KisanFlow: Payment status updated to ${status} for amount ₹${formattedAmount}.`;
    }

    return this.sendSms({
      to: farmerPhone,
      body,
      bookingId,
      farmerId,
      messageType,
    });
  }

  /**
   * Dispatches queue threshold notification SMS
   */
  async sendQueueNotification({ bookingId, farmerPhone, tokenNumber, messageType, estimatedWaitMinutes, farmerId }) {
    let body = '';
    switch (messageType) {
      case 'TURN_APPROACHING':
        body = `KisanFlow: Your token ${tokenNumber} is approaching. Approximate waiting time: ${estimatedWaitMinutes} minutes. Please be ready at the procurement centre.`;
        break;
      case 'TURN_NEAR':
        body = `KisanFlow: Your turn is near. Token ${tokenNumber} is expected in approximately ${estimatedWaitMinutes} minutes. Please proceed towards the procurement area.`;
        break;
      case 'TURN_CALLED':
        body = `KisanFlow: Token ${tokenNumber} is now being called. Please proceed to the procurement counter.`;
        break;
      default:
        return { success: false, error: 'Unknown queue notification type' };
    }

    return this.sendSms({
      to: farmerPhone,
      body,
      bookingId,
      farmerId,
      messageType,
    });
  }

  /**
   * Process Twilio Delivery Status Webhook Callback
   */
  async handleTwilioStatusCallback({ MessageSid, MessageStatus, ErrorCode, ErrorMessage }) {
    if (!MessageSid) {
      const err = new Error('MessageSid is required in Twilio status callback');
      err.statusCode = 400;
      throw err;
    }

    console.log(`[Twilio Status Callback] MessageSid: ${MessageSid}, Status: ${MessageStatus}, Error: ${ErrorCode || 'None'}`);

    const statusUpper = (MessageStatus || 'UNKNOWN').toUpperCase();
    let dbStatus = 'SENT';
    let deliveredAt = null;
    let failedAt = null;

    if (statusUpper === 'DELIVERED') {
      dbStatus = 'DELIVERED';
      deliveredAt = new Date();
    } else if (statusUpper === 'FAILED' || statusUpper === 'UNDELIVERED') {
      dbStatus = 'FAILED';
      failedAt = new Date();
    } else if (statusUpper === 'QUEUED') {
      dbStatus = 'QUEUED';
    }

    const res = await pool.query(
      `UPDATE sms_verifications
       SET provider_status = $1,
           delivery_status = $2,
           status = CASE WHEN status IN ('CONFIRMED', 'DISPUTED') THEN status ELSE $3 END,
           error_code = COALESCE($4, error_code),
           delivered_at = COALESCE($5, delivered_at),
           failed_at = COALESCE($6, failed_at)
       WHERE provider_message_id = $7
       RETURNING id, procurement_id, booking_id, farmer_phone, message_type, provider_status, delivery_status, status, created_at`,
      [MessageStatus, statusUpper, dbStatus, ErrorCode || ErrorMessage || null, deliveredAt, failedAt, MessageSid]
    );

    if (res.rows.length === 0) {
      console.warn(`[Twilio Status Callback] No matching SMS record found for MessageSid: ${MessageSid}`);
      return { found: false, messageSid: MessageSid };
    }

    return {
      found: true,
      record: res.rows[0],
    };
  }

  /**
   * Process inbound SMS webhook (CONFIRM / DISPUTE)
   */
  async handleInboundWebhook({ procurement_id, from, message }) {
    if (!message || typeof message !== 'string') {
      const err = new Error('Inbound SMS message body is required');
      err.statusCode = 400;
      throw err;
    }

    // Normalize reply
    const cleanMsg = message.trim().toUpperCase();
    let responseCode = null;
    let targetStatus = null;

    if (cleanMsg === '1' || cleanMsg === 'CONFIRM') {
      responseCode = '1';
      targetStatus = 'CONFIRMED';
    } else if (cleanMsg === '2' || cleanMsg === 'DISPUTE') {
      responseCode = '2';
      targetStatus = 'DISPUTED';
    } else {
      const err = new Error("Invalid reply message. Accepted replies: '1', 'CONFIRM', '2', 'DISPUTE'");
      err.statusCode = 400;
      throw err;
    }

    let targetProcurementId = procurement_id;
    let targetPhone = from ? this.normalizeInboundPhone(from) : null;

    if (!targetProcurementId && !targetPhone) {
      const err = new Error('Correlation failed: either procurement_id or from phone number must be provided');
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // Correlation resolution
      if (!targetProcurementId) {
        // Find most recent unconfirmed SMS verification for this phone number
        const match = await client.query(
          `SELECT procurement_id
           FROM sms_verifications
           WHERE farmer_phone = $1 AND status IN ('SENT', 'DELIVERED') AND direction = 'OUTBOUND' AND procurement_id IS NOT NULL
           ORDER BY id DESC LIMIT 1`,
          [targetPhone]
        );

        if (match.rows.length === 0) {
          const err = new Error(`No pending SMS verification found for phone: ${targetPhone}`);
          err.statusCode = 404;
          throw err;
        }
        targetProcurementId = match.rows[0].procurement_id;
      }

      // Verify procurement exists
      const procCheck = await client.query(
        `SELECT id FROM procurements WHERE id = $1`,
        [targetProcurementId]
      );

      if (procCheck.rows.length === 0) {
        const err = new Error(`Procurement record not found for ID: ${targetProcurementId}`);
        err.statusCode = 404;
        throw err;
      }

      // Find pending outbound SMS verification
      const verificationRes = await client.query(
        `SELECT id, status, response, farmer_phone FROM sms_verifications
         WHERE procurement_id = $1 AND direction = 'OUTBOUND'
         ORDER BY id DESC LIMIT 1`,
        [targetProcurementId]
      );

      if (verificationRes.rows.length === 0) {
        const err = new Error(`No outbound SMS record found for procurement #${targetProcurementId}`);
        err.statusCode = 404;
        throw err;
      }

      const verification = verificationRes.rows[0];

      // Sender ownership verification when both procurement_id and from are supplied
      if (procurement_id && from) {
        const normalizedSender = this.normalizeInboundPhone(from);
        const normalizedFarmerPhone = this.normalizeInboundPhone(verification.farmer_phone);

        if (!normalizedSender || normalizedSender !== normalizedFarmerPhone) {
          const err = new Error('Access denied: sender phone number does not match procurement farmer');
          err.statusCode = 403;
          throw err;
        }
      }

      // Duplicate response check
      if (verification.status === 'CONFIRMED' || verification.status === 'DISPUTED') {
        const err = new Error(`Procurement #${targetProcurementId} SMS verification is already resolved as '${verification.status}'`);
        err.statusCode = 409;
        throw err;
      }

      // Update SMS verification status
      const updateRes = await client.query(
        `UPDATE sms_verifications
         SET status = $1, response = $2
         WHERE id = $3
         RETURNING id, procurement_id, farmer_phone, direction, response, status, created_at`,
        [targetStatus, responseCode, verification.id]
      );

      if (targetStatus === 'DISPUTED') {
        await client.query(
          `UPDATE procurements
           SET status = 'DISPUTED'
           WHERE id = $1`,
          [targetProcurementId]
        );
      }

      await client.query('COMMIT');

      const updatedVerification = updateRes.rows[0];

      return {
        procurement_id: targetProcurementId,
        status: updatedVerification.status,
        response: updatedVerification.response,
        updated_at: new Date().toISOString(),
      };
    } catch (err) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('[SMS Service Rollback Error]', rollbackErr.message);
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new SmsService();
