import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../utils/api';

const RESEND_SECONDS = 60;

/**
 * VerifyEmail Page — the user enters the 6-digit OTP that was emailed to them
 * after signup. On success the backend returns a JWT and we go to the dashboard.
 * The email arrives through router state: navigate('/verify-email', { state: { email } })
 */
export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const resendNow = location.state?.resendNow;

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(resendNow ? 0 : RESEND_SECONDS);

  useEffect(() => {
    if (!email) navigate('/signup', { replace: true });
  }, [email, navigate]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!/^\d{6}$/.test(otp)) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const data = await authAPI.verifyEmail({ email, otp });
      if (data.success) {
        localStorage.setItem('authToken', data.data.token);
        navigate('/dashboard');
      } else {
        setError(data.message || 'Verification failed');
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      await authAPI.resendOtp({ email });
      setInfo('A new code has been sent to your email.');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(err.message || 'Could not resend the code');
    }
  };

  if (!email) return null;

  return (
    <div className="min-h-screen w-full bg-surface flex items-center justify-center px-4 py-10">
      <div
        className="w-full max-w-[420px] bg-white rounded-[24px] p-8 sm:p-10"
        style={{ boxShadow: '0 10px 40px -10px rgba(138, 43, 87, 0.12)' }}
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
            <span className="material-symbols-outlined text-2xl">mark_email_read</span>
          </div>
          <h2 className="font-headline text-3xl font-bold text-primary mb-2 tracking-tight">
            Verify your email
          </h2>
          <p className="font-body text-sm text-on-surface-variant">
            We sent a 6-digit code to
            <br />
            <span className="font-semibold text-on-surface break-all">{email}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm">{info}</p>
          </div>
        )}

        <form onSubmit={handleVerify} className="flex flex-col gap-5">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full py-4 text-center text-3xl font-bold tracking-[0.5em] bg-surface-container-high border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-body text-on-surface"
            autoFocus
          />

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full py-3 rounded-lg bg-primary text-white font-label font-semibold transition-opacity disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm font-body text-on-surface-variant">
          Didn&apos;t get the code?{' '}
          {secondsLeft > 0 ? (
            <span>Resend in {secondsLeft}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="text-primary font-semibold hover:underline"
            >
              Resend code
            </button>
          )}
          <p className="mt-2 text-xs">Check your spam folder too.</p>
        </div>

        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
