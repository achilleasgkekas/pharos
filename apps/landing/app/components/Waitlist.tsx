'use client';

import { useState } from 'react';

const CONTACT_EMAIL = 'hello@ph-aros.com';

export function Waitlist() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const subject = encodeURIComponent('PHAROS hosted waitlist');
    const body = encodeURIComponent(
      `Please add me to the PHAROS hosted waitlist.\n\nEmail: ${email.trim()}\n`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <form className="waitlist-form" onSubmit={handleSubmit} noValidate>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        aria-label="Email address"
        placeholder="you@example.com"
        className="waitlist-input"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setSent(false);
        }}
        required
      />
      <button type="submit" className="btn btn-primary" disabled={!valid}>
        Join the waitlist
      </button>
      {sent && (
        <p className="waitlist-note" role="status">
          Your email app should be opening. If not, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--accent)' }}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      )}
      <noscript>
        <p className="waitlist-note">
          Email{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('PHAROS hosted waitlist')}`}
            style={{ color: 'var(--accent)' }}
          >
            {CONTACT_EMAIL}
          </a>{' '}
          to join the hosted waitlist.
        </p>
      </noscript>
    </form>
  );
}
