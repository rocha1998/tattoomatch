const express = require("express");

const {
  forgotPassword,
  login,
  register,
  resetPassword,
  validateResetToken,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.get("/reset-password/validate", validateResetToken);
router.post("/reset-password", resetPassword);

module.exports = router;
