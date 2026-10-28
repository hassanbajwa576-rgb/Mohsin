import { ImageResponse } from 'next/og';

// The AlphaBOLD mark (gold square with the arrow), as a standalone SVG.
const MARK = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 41.5 57.5'><defs><linearGradient id='g' x1='29.6' y1='3' x2='13.4' y2='48.6' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#f7bf17'/><stop offset='1' stop-color='#cb9328'/></linearGradient></defs><polygon fill='#ffffff' points='23.3 29.2 40 39.4 40 19 23.3 29.2'/><polygon fill='#050505' points='29.4 29.2 40 35.4 40 23 29.4 29.2'/><polygon fill='url(#g)' points='1.5 1.8 1.5 55.7 40 55.7 40 38.7 23.5 29.2 40 19.7 40 1.8 1.5 1.8'/></svg>";
const SRC = 'data:image/svg+xml;base64,' + Buffer.from(MARK).toString('base64');

// App icon in the sizes the manifest and iOS home screen ask for: the mark on white, kept inside the safe area for round icons.
export async function GET(_req, { params }) {
  const { size } = await params;
  const px = size === '512' ? 512 : size === '180' ? 180 : 192;
  const h = Math.round(px * 0.56);
  const w = Math.round((h * 41.5) / 57.5);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <img src={SRC} width={w} height={h} alt='' />
      </div>
    ),
    { width: px, height: px }
  );
}
