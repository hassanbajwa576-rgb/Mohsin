// Shown immediately while the next page is being prepared, so navigation never feels frozen.
export default function Loading() {
  return (
    <div className='skeleton' aria-busy='true' aria-live='polite'>
      <div className='sk sk-title' />
      <div className='sk sk-card' />
      <div className='sk sk-card' />
    </div>
  );
}
