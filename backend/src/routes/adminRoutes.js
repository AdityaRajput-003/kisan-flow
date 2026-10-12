const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/admin/overview - ADMIN role only
router.get('/admin/overview', authenticate, requireRole('ADMIN'), adminController.getOverview);

// Dispute Management - ADMIN role only
router.get('/admin/disputes', authenticate, requireRole('ADMIN'), adminController.getDisputes);
router.patch('/admin/disputes/:id/resolve', authenticate, requireRole('ADMIN'), adminController.resolveDispute);

module.exports = router;
