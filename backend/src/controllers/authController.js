const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Guardian = require("../models/Guardian");
const { logActivity } = require("./activityController");

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendVerificationEmail } = require("../services/emailService");

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const issueEmailOtp = async (user) => {
  const otp = String(crypto.randomInt(100000, 1000000));
  user.emailOtpHash = await bcrypt.hash(otp, 10);
  user.emailOtpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.emailOtpAttempts = 0;
  await user.save();

  await sendVerificationEmail(user.email, user.fullName, otp);

  user.emailOtpSentAt = new Date();
  await user.save();
};

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const registerUser = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      phone,
      password,
      confirmPassword,
      termsAccepted,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
    } = req.body;

    // Step 1: Validation
    if (!fullName || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    // Phone validation
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be exactly 10 digits",
      });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    if (
      !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])/.test(
        password,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least one uppercase, one lowercase, one number, and one special character",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Terms of Service validation
    if (!termsAccepted) {
      return res.status(400).json({
        success: false,
        message: "You must accept the Terms of Service and Privacy Policy",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Check if email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      if (!userExists.isEmailVerified) {
        const recentlySent =
          userExists.emailOtpSentAt &&
          Date.now() - userExists.emailOtpSentAt.getTime() < RESEND_COOLDOWN_MS;
        if (!recentlySent) await issueEmailOtp(userExists);
        return res.status(200).json({
          success: true,
          message:
            "This email is registered but not verified yet. Please enter the code we emailed you.",
          data: { email: userExists.email, emailSent: true },
        });
      }
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    // Step 2: Create User
    const user = await User.create({
      fullName,
      email,
      phone,
      password,
      emergencyContactName,
      emergencyContactPhone,
      termsAcceptedAt: new Date(),
      isActive: true,
    });

    let guardian = null;

    // Step 3: Create Guardian (if emergency contact provided)
    if (emergencyContactName && emergencyContactPhone) {
      // Validate emergency contact phone
      if (!phoneRegex.test(emergencyContactPhone)) {
        return res.status(400).json({
          success: false,
          message: "Emergency contact phone number must be exactly 10 digits",
        });
      }

      // Check if guardian already exists for this user
      const existingGuardian = await Guardian.findOne({
        userId: user._id,
        guardianPhone: emergencyContactPhone,
      });

      if (existingGuardian) {
        return res.status(400).json({
          success: false,
          message: "This emergency contact is already added",
        });
      }

      guardian = await Guardian.create({
        userId: user._id,
        guardianName: emergencyContactName,
        guardianPhone: emergencyContactPhone,
        relationship: emergencyContactRelationship || "Other",
        status: "active",
        addedAt: Date.now(),
        isVerified: false,
      });
    }

    // Step 4: Generate JWT Token
    let emailSent = true;
    try {
      await issueEmailOtp(user);
    } catch (mailErr) {
      console.error("Verification email failed:", mailErr.message);
      emailSent = false;
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? "Verification code sent to your email"
        : "Account created, but we could not send the code. Please tap Resend code.",
      data: { email: user.email, emailSent },
    });
  } catch (err) {
    next(err);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Please provide email and password");
    }

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      res.status(401);
      throw new Error("Invalid credentials");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401);
      throw new Error("Invalid credentials");
    }

    if (!user.isEmailVerified) {
      res.status(403);
      throw new Error("Please verify your email to log in.");
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id, user.email);

    await logActivity(user._id, "login", { ip: req.ip });

    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    await logActivity(req.user.userId, "logout", {});
    res
      .status(200)
      .json({ success: true, message: "Logged out successfully", data: {} });
  } catch (err) {
    next(err);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }
    res
      .status(200)
      .json({ success: true, message: "User fetched", data: user });
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const token = generateToken(req.user.userId, req.user.email);
    res
      .status(200)
      .json({ success: true, message: "Token refreshed", data: { token } });
  } catch (err) {
    next(err);
  }
};

const verifyEmail = async (req, res, next) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and code are required' });
        }

        const user = await User.findOne({ email: String(email).trim().toLowerCase() })
            .select('+emailOtpHash +emailOtpExpires');

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        }
        if (user.isEmailVerified) {
            return res.status(400).json({ success: false, message: 'Email already verified. Please log in.' });
        }
        if (!user.emailOtpHash || !user.emailOtpExpires || user.emailOtpExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'Code expired. Please request a new one.' });
        }
        if (user.emailOtpAttempts >= MAX_ATTEMPTS) {
            return res.status(429).json({ success: false, message: 'Too many wrong attempts. Please request a new code.' });
        }

        const isMatch = await bcrypt.compare(String(otp).trim(), user.emailOtpHash);
        if (!isMatch) {
            user.emailOtpAttempts += 1;
            await user.save();
            return res.status(400).json({ success: false, message: 'Incorrect code' });
        }

        user.isEmailVerified = true;
        user.emailOtpHash = undefined;
        user.emailOtpExpires = undefined;
        user.emailOtpAttempts = 0;
        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id, user.email);
        await logActivity(user._id, 'login', { method: 'email_verification' });

        res.status(200).json({
            success: true,
            message: 'Email verified successfully',
            data: {
                token,
                user: { userId: user._id, fullName: user.fullName, email: user.email, phone: user.phone }
            }
        });
    } catch (err) {
        next(err);
    }
};

const resendEmailOtp = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const user = await User.findOne({ email: String(email).trim().toLowerCase() });
        const genericReply = { success: true, message: 'If this account needs verification, a new code has been sent.' };

        if (!user || user.isEmailVerified) {
            return res.status(200).json(genericReply);
        }

        if (user.emailOtpSentAt) {
            const elapsed = Date.now() - user.emailOtpSentAt.getTime();
            if (elapsed < RESEND_COOLDOWN_MS) {
                const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
                return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another code` });
            }
        }

        await issueEmailOtp(user);
        res.status(200).json(genericReply);
    } catch (err) {
        next(err);
    }
};

module.exports = { registerUser, loginUser, logoutUser, getCurrentUser, refreshToken, verifyEmail, resendEmailOtp };


