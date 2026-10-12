const adminService = require('../services/adminService');

const getOverview = async (req, res, next) => {
  try {
    const targetDate = req.query.date;
    const data = await adminService.getOverview(targetDate);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

const getDisputes = async (req, res, next) => {
  try {
    const data = await adminService.getDisputes();
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

const resolveDispute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (!id || isNaN(numId) || !Number.isInteger(numId) || numId <= 0 || !/^\d+$/.test(String(id).trim())) {
      return res.status(400).json({
        success: false,
        error: `Invalid procurement ID: ${id}`,
      });
    }
    const data = await adminService.resolveDispute(numId);
    res.status(200).json({
      success: true,
      message: 'Dispute resolved successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOverview,
  getDisputes,
  resolveDispute,
};
