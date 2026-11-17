'use client';

export default function GlobalError() {
  return (
    <html lang="en">
      <body
        style={{
          background: '#b10225',
          color: '#D1CFC0',
          fontFamily: 'sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          margin: 0,
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{fontSize: '4rem', margin: 0}}>{500}</h1>
          <p>Something went wrong.</p>
          <br />
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#222',
              color: '#D1CFC0',
              border: 0,
              borderRadius: 4,
              padding: '10px 24px',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
