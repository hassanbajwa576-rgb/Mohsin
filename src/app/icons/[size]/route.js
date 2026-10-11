import { ImageResponse } from 'next/og';

// App icon in the sizes the manifest and iOS home screen ask for.
export async function GET(_req, { params }) {
  const { size } = await params;
  const px = size === '512' ? 512 : size === '180' ? 180 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#e3ad21',
          color: '#0f0f0f',
          fontSize: Math.round(px * 0.46),
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        PT
      </div>
    ),
    { width: px, height: px }
  );
}
